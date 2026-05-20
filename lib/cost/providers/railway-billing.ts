// Railway 计费: GraphQL estimatedUsage(measurements) 返当前周期(月)的 usage 量
// 乘上本地硬编单价(Railway 不暴露单价 API)算出当月预估金额
// 借鉴自 reference repo apps/mira-monitor/src/providers/railway/client.ts

import { env } from "../../env";
import { fetchWithRetry } from "../fetch-with-retry";

const RAILWAY_GRAPHQL = "https://backboard.railway.com/graphql/v2";

// USD 单价,来源:reference repo + Railway 官方计费页(2025-Q1)
// Disk/Backup 是按 GB·month,这里折成 GB·hour 单价(43800 = 30.5 天 * 24h)
const RAILWAY_PRICES: Record<string, number> = {
  CPU_USAGE: 0.000463,           // per vCPU-hour
  MEMORY_USAGE_GB: 0.000231,     // per GB-hour
  NETWORK_TX_GB: 0.05,           // per GB
  DISK_USAGE_GB: 0.25 / 43_800,
  BACKUP_USAGE_GB: 0.25 / 43_800,
};

const RAILWAY_MEASUREMENTS = Object.keys(RAILWAY_PRICES);

interface RailwayEstimatedUsageEntry {
  measurement: string;
  estimatedValue: number;
  projectId: string | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export interface RailwayDailyCollected {
  monthlyEstimateUsd: number;
  projects: { project_id: string; cost_usd: number }[];
}

export const fetchRailwayDaily = async (): Promise<RailwayDailyCollected> => {
  const token = env.cost.railwayToken;
  if (!token) throw new Error("RAILWAY_DATASOURCE_TOKEN not configured");

  const body = JSON.stringify({
    query:
      "query estimatedUsage($measurements: [MetricMeasurement!]!) { estimatedUsage(measurements: $measurements) { measurement estimatedValue projectId } }",
    variables: { measurements: RAILWAY_MEASUREMENTS },
  });

  const res = await fetchWithRetry(RAILWAY_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Railway HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as GraphQLResponse<{ estimatedUsage: RailwayEstimatedUsageEntry[] }>;
  if (json.errors?.length) {
    throw new Error(`Railway GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  const projectCosts = new Map<string, number>();
  for (const e of json.data?.estimatedUsage ?? []) {
    const price = RAILWAY_PRICES[e.measurement] ?? 0;
    const cost = Number(e.estimatedValue ?? 0) * price;
    const key = e.projectId ?? "unknown";
    projectCosts.set(key, (projectCosts.get(key) ?? 0) + cost);
  }

  const projects = [...projectCosts.entries()]
    .map(([project_id, cost_usd]) => ({ project_id, cost_usd }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  return {
    monthlyEstimateUsd: projects.reduce((acc, p) => acc + p.cost_usd, 0),
    projects,
  };
};
