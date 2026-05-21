// Railway 计费: GraphQL estimatedUsage(measurements) 返当前周期(月)的 usage 量
// 乘上本地硬编单价(Railway 不暴露单价 API)算出当月预估金额
//
// ─── 鉴权两种模式(2026-05 Railway 收紧鉴权后必须区分) ─────────────────
// Railway 近期改了 token 鉴权策略,同一个 endpoint(/graphql/v2)对两种 token 走不同 header + 不同参数:
//
//   1. Project Token(在 Project Settings → Tokens 创建,scope=单个 project)
//      - Header: `Project-Access-Token: <token>`  (不是 Bearer!)
//      - estimatedUsage 必须传 projectId(账户级枚举不在 Project Token scope 里)
//      - projectId 通过 `{ projectToken { projectId } }` 自己问 Railway 拿
//
//   2. Account/Workspace Token(Account Settings → Tokens,或 Team Settings → Tokens)
//      - Header: `Authorization: Bearer <token>`(传统 Bearer)
//      - estimatedUsage 不传 projectId,Railway 返当前 account 下所有 project 的 usage
//
// 首次调用做探测 + 缓存,后续直接走对应路径。两种探测都失败抛错并提示双向错误。
// 同款修复见 mira 主站 apps/mira-monitor/src/providers/railway/client.ts。

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

export type RailwayAuthMode =
  | { mode: "project"; projectId: string }
  | { mode: "account" };

// module-level 缓存,每个 Node 进程探测一次后所有调用复用
let cachedAuthMode: RailwayAuthMode | null = null;

/**
 * 探测 Project Token:发 `Project-Access-Token` 头 + `projectToken { projectId }` query。
 * 成功返回 projectId,失败返回 null。
 */
const probeProjectToken = async (token: string): Promise<string | null> => {
  try {
    const res = await fetchWithRetry(RAILWAY_GRAPHQL, {
      method: "POST",
      headers: {
        "Project-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ projectToken { projectId } }" }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GraphQLResponse<{
      projectToken?: { projectId?: string } | null;
    }>;
    if (json.errors?.length) return null;
    return json.data?.projectToken?.projectId ?? null;
  } catch {
    return null;
  }
};

/**
 * 探测 Account/Workspace Token:发 `Authorization: Bearer` 头 + `me { id }` query。
 * 成功返 true,失败返 false。
 */
const probeAccountToken = async (token: string): Promise<boolean> => {
  try {
    const res = await fetchWithRetry(RAILWAY_GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ me { id } }" }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as GraphQLResponse<{ me?: { id?: string } | null }>;
    if (json.errors?.length) return false;
    return Boolean(json.data?.me?.id);
  } catch {
    return false;
  }
};

/**
 * 首次调用做探测,后续直接读 cachedAuthMode。
 * 两种 token 都失败时抛错并说清楚试过的两条路径,方便排障。
 */
export const detectRailwayAuthMode = async (
  token: string,
  options: { force?: boolean } = {},
): Promise<RailwayAuthMode> => {
  if (cachedAuthMode && !options.force) return cachedAuthMode;

  const projectId = await probeProjectToken(token);
  if (projectId) {
    cachedAuthMode = { mode: "project", projectId };
    return cachedAuthMode;
  }

  const isAccount = await probeAccountToken(token);
  if (isAccount) {
    cachedAuthMode = { mode: "account" };
    return cachedAuthMode;
  }

  throw new Error(
    "Railway token rejected by both auth probes:\n" +
      "  - Project-Access-Token + { projectToken { projectId } }  → failed\n" +
      "  - Authorization: Bearer + { me { id } }                  → failed\n" +
      "Possible causes: token expired, revoked, lacks billing scope, or workspace migration broke it.\n" +
      "Verify in Railway dashboard and re-issue if needed.",
  );
};

export const fetchRailwayDaily = async (): Promise<RailwayDailyCollected> => {
  const token = env.cost.railwayBillingToken ?? env.cost.railwayToken;
  if (!token) throw new Error("RAILWAY_BILLING_TOKEN (or RAILWAY_DATASOURCE_TOKEN) not configured");

  const auth = await detectRailwayAuthMode(token);

  // Project Token 走 Project-Access-Token 头 + 传 projectId
  // Account/Workspace Token 走 Bearer 头 + 不传 projectId(枚举所有 project)
  const headers: Record<string, string> =
    auth.mode === "project"
      ? { "Project-Access-Token": token, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const query =
    auth.mode === "project"
      ? "query estimatedUsage($measurements: [MetricMeasurement!]!, $projectId: String!) { estimatedUsage(measurements: $measurements, projectId: $projectId) { measurement estimatedValue projectId } }"
      : "query estimatedUsage($measurements: [MetricMeasurement!]!) { estimatedUsage(measurements: $measurements) { measurement estimatedValue projectId } }";

  const variables =
    auth.mode === "project"
      ? { measurements: RAILWAY_MEASUREMENTS, projectId: auth.projectId }
      : { measurements: RAILWAY_MEASUREMENTS };

  const res = await fetchWithRetry(RAILWAY_GRAPHQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Railway HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as GraphQLResponse<{ estimatedUsage: RailwayEstimatedUsageEntry[] }>;
  if (json.errors?.length) {
    throw new Error(`Railway GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  const projectCosts = new Map<string, number>();
  const fallbackProjectId = auth.mode === "project" ? auth.projectId : "unknown";
  for (const e of json.data?.estimatedUsage ?? []) {
    const price = RAILWAY_PRICES[e.measurement] ?? 0;
    const cost = Number(e.estimatedValue ?? 0) * price;
    const key = e.projectId ?? fallbackProjectId;
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

// 暴露给测试脚本用的内部成员
export const __internals = {
  RAILWAY_GRAPHQL,
  RAILWAY_MEASUREMENTS,
  RAILWAY_PRICES,
  probeProjectToken,
  probeAccountToken,
  resetAuthCache: () => {
    cachedAuthMode = null;
  },
};
