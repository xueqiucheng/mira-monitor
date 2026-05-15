import type { LlmMetrics, ModelUsage, ToolUsage } from "../types";
import { env } from "../env";

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

const fetchLangfuse = async <T>(path: string, timeoutMs = 12_000): Promise<T> => {
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
      return (await res.json()) as T;
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
      totalTokens += u.totalUsage;
      totalCost += u.totalCost;
      const existing = modelMap.get(u.model);
      if (existing) {
        existing.taskCount += u.countTraces;
        existing.totalTokens += u.totalUsage;
        existing.totalCost += u.totalCost;
      } else {
        modelMap.set(u.model, {
          model: u.model,
          taskCount: u.countTraces,
          totalTokens: u.totalUsage,
          totalCost: u.totalCost,
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
