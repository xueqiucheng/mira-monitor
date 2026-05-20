import type { UpstreamStatus } from "../types";

// statuspage.io /api/v2/components.json 子系统级状态
interface StatuspageComponent {
  name: string;
  status:
    | "operational"
    | "degraded_performance"
    | "partial_outage"
    | "major_outage"
    | "under_maintenance";
  group?: boolean;
}

interface ComponentsResp {
  components: StatuspageComponent[];
}

interface ProviderConfig {
  name: string;
  publicUrl: string;
  apiUrl: string;
  /**
   * 我们关注的子系统名字。substring 命中（大小写不敏感）。
   * 空数组 = 退化到看所有子系统（约等于原"总状态灯"行为）。
   * 维护原则：只列我们实际依赖的服务，避免被 Billing / Marketplace / 偏门区域服务的事故误触发橙灯。
   * 全量子系统名见 /api/v2/components.json，每家厂商不同。
   */
  watchedComponents: string[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "Sentry",
    publicUrl: "https://status.sentry.io/",
    apiUrl: "https://status.sentry.io/api/v2/components.json",
    // Mira 部署在 US，只关心 US ingest + alerting + 通用 API/Dashboard
    watchedComponents: [
      "API",
      "Dashboard",
      "US Error Ingestion",
      "US Errors Alerting",
      "US Transaction Ingestion",
      "US Transactions Alerting",
    ],
  },
  {
    name: "Vercel",
    publicUrl: "https://www.vercel-status.com/",
    apiUrl: "https://www.vercel-status.com/api/v2/components.json",
    // 即使 Mira 不直接部在 Vercel，Edge Network 仍是上游链路指标
    watchedComponents: [
      "Edge Network",
      "Edge Functions",
      "Serverless Functions",
      "Builds",
      "DNS",
    ],
  },
  {
    name: "Cloudflare",
    publicUrl: "https://www.cloudflarestatus.com/",
    apiUrl: "https://www.cloudflarestatus.com/api/v2/components.json",
    // 关键：CDN/Cache、Authoritative DNS、API。明确剔除 Billing / Marketplace / 边缘特性
    watchedComponents: [
      "CDN/Cache",
      "Authoritative DNS",
      "API",
      "Workers",
      "Access",
      "WAF",
      "Network",
    ],
  },
  {
    name: "Anthropic",
    publicUrl: "https://status.anthropic.com/",
    apiUrl: "https://status.anthropic.com/api/v2/components.json",
    // 仅 API；console / claude.ai 挂了不影响 Mira
    watchedComponents: ["Claude API"],
  },
  {
    name: "OpenAI",
    publicUrl: "https://status.openai.com/",
    apiUrl: "https://status.openai.com/api/v2/components.json",
    // API 相关；ChatGPT / Sora / GPTs 这些 UI 产品挂了不影响 Mira
    watchedComponents: [
      "Chat Completions",
      "Responses",
      "Embeddings",
      "Realtime",
      "Files",
    ],
  },
  {
    name: "Railway",
    publicUrl: "https://railway.statuspage.io/",
    apiUrl: "https://railway.statuspage.io/api/v2/components.json",
    // 空 = 看所有子系统。Railway statuspage 子系统粒度较粗，暂不过滤
    watchedComponents: [],
  },
];

// statuspage component status → 我们的状态，按严重度排序
const SEVERITY_RANK: Record<StatuspageComponent["status"], number> = {
  operational: 0,
  under_maintenance: 1,
  degraded_performance: 2,
  partial_outage: 3,
  major_outage: 4,
};

const componentStatusToOurs = (
  s: StatuspageComponent["status"],
): UpstreamStatus["status"] => {
  if (s === "operational") return "operational";
  if (s === "major_outage" || s === "partial_outage") return "down";
  return "degraded"; // degraded_performance / under_maintenance
};

const matchesWatched = (name: string, watched: string[]): boolean => {
  if (watched.length === 0) return true; // 空 watchlist = 全部命中
  const lower = name.toLowerCase();
  return watched.some((w) => lower.includes(w.toLowerCase()));
};

export const fetchStatuspages = async (): Promise<UpstreamStatus[]> => {
  const now = new Date().toISOString();
  return Promise.all(
    PROVIDERS.map(async (p): Promise<UpstreamStatus> => {
      const base: UpstreamStatus = {
        name: p.name,
        status: "unknown",
        url: p.publicUrl,
        lastChecked: now,
        watchedComponents: p.watchedComponents,
        affectedComponents: [],
      };
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(p.apiUrl, {
          signal: controller.signal,
          next: { revalidate: 60 },
        });
        clearTimeout(timer);
        if (!res.ok) return base;

        const data = (await res.json()) as ComponentsResp;
        // 过滤：跳过 group 父节点（status 是聚合值，不准），按 watchedComponents 命中
        const matched = data.components.filter(
          (c) => !c.group && matchesWatched(c.name, p.watchedComponents),
        );

        if (matched.length === 0) {
          // watchlist 配错了完全不命中 → 给个明显的 unknown，方便发现配置漂移
          return base;
        }

        // 取最差状态
        let worst: StatuspageComponent["status"] = "operational";
        for (const c of matched) {
          if (SEVERITY_RANK[c.status] > SEVERITY_RANK[worst]) worst = c.status;
        }

        return {
          ...base,
          status: componentStatusToOurs(worst),
          affectedComponents: matched
            .filter((c) => c.status !== "operational")
            .map((c) => ({ name: c.name, status: c.status })),
        };
      } catch {
        return base;
      }
    }),
  );
};
