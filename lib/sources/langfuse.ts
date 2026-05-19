import type { LlmMetrics, ModelUsage, ToolUsage } from "../types";
import { env } from "../env";

// ─── 模型命名规范化 ────────────────────────────────────────────────
// mira 主站里 LLM 调用混用了 3 种命名（dash / dot / 带前缀），Langfuse 价格表
// 只认其中一部分，剩下的 totalCost 返 0 导致 dashboard 总成本被低估。
// 这里在客户端把变体规范成 canonical 名 + 兜底重算成本。
// 长期方案：主站统一命名后这里可以拆掉。
const MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
  "anthropic/claude-sonnet-4-6": "claude-sonnet-4-6",
  "anthropic/claude-haiku-4.5": "claude-haiku-4-5",
  "anthropic/claude-haiku-4-5": "claude-haiku-4-5",
};

const normalizeModel = (m: string): string => MODEL_ALIASES[m] ?? m;

// 兜底价格（USD per token）——仅当 Langfuse 返回 totalCost=0 但 token>0 时用
// 来源：Anthropic 官方定价（如有变动同步更新）
//   Claude Sonnet 4.6 : input $3 / output $15 per 1M tokens
//   Claude Haiku  4.5 : input $1 / output $5  per 1M tokens
// 不含 cached input / prompt caching 优惠，估算值偏高一点是预期。
const FALLBACK_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-haiku-4-5": { input: 1 / 1_000_000, output: 5 / 1_000_000 },
};

const computeFallbackCost = (
  canonicalModel: string,
  inputTokens: number,
  outputTokens: number,
): number => {
  const p = FALLBACK_PRICES[canonicalModel];
  if (!p) return 0;
  return inputTokens * p.input + outputTokens * p.output;
};

interface DailyUsageRow {
  model: string | null;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  totalCost: number;
  countObservations: number;
  countTraces: number;
}

interface DailyMetricsRow {
  date: string;
  countTraces: number;
  countObservations: number;
  totalCost: number;
  usage: DailyUsageRow[];
}

interface DailyMetricsResponse {
  data: DailyMetricsRow[];
}

interface SpanObservation {
  name: string | null;
  startTime: string;
}

interface ObservationsResponse {
  data: SpanObservation[];
}

const authHeader = (): string => {
  const { publicKey, secretKey } = env.langfuse;
  if (!publicKey || !secretKey) throw new Error("Langfuse not configured");
  return `Basic ${btoa(`${publicKey}:${secretKey}`)}`;
};

// ─── 进程级内存缓存 ─────────────────────────────────────────────
// Langfuse 免费档 rate limit 容易撞（每次 /api/metrics 触发 3 个请求 ×
// 多人同时刷 dashboard）。加 60s TTL 缓存：同一 path 60s 内只打一次 Langfuse。
// 失败不缓存（429 / 5xx 等错误下次仍会重试），rate limit 自然恢复后即可重新拉取。
// 注：单 Node 进程共享；Railway 多副本场景需要换成 Redis（当前单副本不用考虑）。
const LANGFUSE_CACHE_TTL_MS = 60_000;
const langfuseCache = new Map<string, { value: unknown; expiresAt: number }>();

const fetchLangfuse = async <T>(path: string, timeoutMs = 12_000): Promise<T> => {
  const cached = langfuseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const { host } = env.langfuse;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}${path}`, {
        headers: { Authorization: authHeader() },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Langfuse ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as T;
      langfuseCache.set(path, {
        value: data,
        expiresAt: Date.now() + LANGFUSE_CACHE_TTL_MS,
      });
      return data;
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Langfuse fetch failed");
};

const fetchSpanSample = async (from: string, pages: number): Promise<SpanObservation[]> => {
  const all: SpanObservation[] = [];
  const fromEnc = encodeURIComponent(from);
  for (let page = 1; page <= pages; page++) {
    const resp = await fetchLangfuse<ObservationsResponse>(
      `/api/public/observations?type=SPAN&fromStartTime=${fromEnc}&limit=100&page=${page}`,
    );
    all.push(...resp.data);
    if (resp.data.length < 100) break;
  }
  return all;
};

export const fetchLlmMetrics = async (): Promise<LlmMetrics> => {
  const from24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const fromSpans = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const [daily, spans] = await Promise.all([
    fetchLangfuse<DailyMetricsResponse>(`/api/public/metrics/daily?fromTimestamp=${encodeURIComponent(from24h)}`),
    fetchSpanSample(fromSpans, 2),
  ]);

  const modelMap = new Map<string, ModelUsage>();
  let totalTokens = 0;
  let totalCost = 0;
  let totalTraces = 0;
  for (const row of daily.data) {
    totalTraces += row.countTraces;
    for (const u of row.usage) {
      if (!u.model) continue;
      const canonical = normalizeModel(u.model);
      // Langfuse 返 0 但 token > 0 → 价格表缺这个 model 名，按 canonical 名兜底重算
      const cost =
        u.totalCost > 0
          ? u.totalCost
          : computeFallbackCost(canonical, u.inputUsage, u.outputUsage);
      totalTokens += u.totalUsage;
      totalCost += cost;
      const existing = modelMap.get(canonical);
      if (existing) {
        existing.taskCount += u.countTraces;
        existing.totalTokens += u.totalUsage;
        existing.totalCost += cost;
      } else {
        modelMap.set(canonical, {
          model: canonical,
          taskCount: u.countTraces,
          totalTokens: u.totalUsage,
          totalCost: cost,
        });
      }
    }
  }
  const byModel = [...modelMap.values()].sort((a, b) => b.totalCost - a.totalCost).slice(0, 6);

  const toolMap = new Map<string, number>();
  for (const s of spans) {
    if (!s.name?.startsWith("ai.toolCall ")) continue;
    const tool = s.name.replace(/^ai\.toolCall\s+/, "").trim() || s.name;
    toolMap.set(tool, (toolMap.get(tool) ?? 0) + 1);
  }
  const topTools: ToolUsage[] = [...toolMap.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    byModel,
    totalTokens24h: totalTokens,
    totalCost24h: totalCost,
    avgCostPerTask: totalTraces > 0 ? totalCost / totalTraces : 0,
    topTools,
  };
};
