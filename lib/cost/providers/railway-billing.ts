// Railway 计费: GraphQL estimatedUsage(measurements) 返当前周期(月)的 usage 量
// 乘上本地硬编单价(Railway 不暴露单价 API)算出当月预估金额
//
// ─── 鉴权三种模式(2026-05 Railway 收紧鉴权后) ──────────────────────────
// 三类 token 对应三套不同 header + 参数,首次调用做探测 + module 级缓存:
//
//   1. Project Token (Project Settings → Tokens,scope=单个 project)
//      - Header: `Project-Access-Token: <token>`
//      - estimatedUsage 必须传 projectId(用 `{ projectToken { projectId } }` 自己问出来)
//      - projectId 仅返该 token scope 内的 project usage
//
//   2. Team Token (Team Settings → Tokens,scope=整个 team workspace)
//      - Header: `Authorization: Bearer <token>`
//      - estimatedUsage 不传 projectId 也不传 workspaceId,Railway 自动返 team 下所有 project
//      - **不能调 `me { id }`** ← 探测时这条会失败,所以要用 estimatedUsage 直接探
//
//   3. Personal Access Token (Account Settings → Tokens,scope=个人 workspace)
//      - Header: `Authorization: Bearer <token>`
//      - 当前 schema 下 estimatedUsage 没有 workspace 上下文会报 "Workspace not found"
//      - 跑这条路径需要额外解析 me.workspaces 拿 workspaceId 再传给 estimatedUsage
//      - **当前实现不支持 PAT**(Team Token 已经覆盖了 mira 真实需求,见 README 部署文档)
//      - 探测仍保留 `me { id }` 的兜底,命中 → 抛错提示用户换 Team Token
//
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

// 探测时用的最小 measurement,只是为了看 estimatedUsage 能否被这个 token 调起来
const PROBE_MEASUREMENT = "CPU_USAGE";

interface RailwayEstimatedUsageEntry {
  measurement: string;
  estimatedValue: number;
  projectId: string | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export interface RailwayProjectBreakdown {
  project_id: string;
  name: string | null;
  cost_usd: number;
}

export interface RailwayDailyCollected {
  monthlyEstimateUsd: number;
  projects: RailwayProjectBreakdown[];
}

export type RailwayAuthMode =
  | { mode: "project"; projectId: string }
  | { mode: "bearer-direct" }
  | { mode: "account-pat-unsupported" }; // 占位,触发时直接抛 helpful error

let cachedAuthMode: RailwayAuthMode | null = null;

// ─── 探测 ─────────────────────────────────────────────────────────────────

/**
 * Project Token 探测:`Project-Access-Token` 头 + `{ projectToken { projectId } }` query。
 * 命中返回 projectId,失败 null。
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
 * Bearer 直接探测:`Authorization: Bearer` 头 + `estimatedUsage` 直接试。
 * 这是 Team Token 的特征——Bearer + 不传任何 scope 参数就能拿数据。
 * 返 array 即视为命中,返 errors(如 "Workspace not found")视为不命中。
 */
const probeBearerDirect = async (token: string): Promise<boolean> => {
  try {
    const res = await fetchWithRetry(RAILWAY_GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ estimatedUsage(measurements: [${PROBE_MEASUREMENT}]) { measurement } }`,
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as GraphQLResponse<{
      estimatedUsage?: unknown[];
    }>;
    if (json.errors?.length) return false;
    return Array.isArray(json.data?.estimatedUsage);
  } catch {
    return false;
  }
};

/**
 * PAT 探测:`Authorization: Bearer` 头 + `{ me { id } }`。
 * 命中但 estimatedUsage 需要 workspaceId 才能跑,所以这里只用于"诊断 token 类型",
 * 命中后我们抛 helpful error 让用户换 Team Token。
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
 * 探测顺序:Project Token → Team Token (bearer-direct) → PAT(只用来出 helpful error)。
 * 失败统一抛错并列出全部尝试过的路径。
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

  if (await probeBearerDirect(token)) {
    cachedAuthMode = { mode: "bearer-direct" };
    return cachedAuthMode;
  }

  if (await probeAccountToken(token)) {
    cachedAuthMode = { mode: "account-pat-unsupported" };
    throw new Error(
      "Railway token is a Personal Access Token. Current implementation requires a Team Token instead.\n" +
        "Reason: PAT can only call estimatedUsage with explicit workspaceId, which doesn't cover team-owned projects.\n" +
        "Fix: Railway → Team Settings → Tokens → New Token,把这个值替换 RAILWAY_BILLING_TOKEN。",
    );
  }

  throw new Error(
    "Railway token rejected by all three auth probes:\n" +
      "  - Project-Access-Token + { projectToken { projectId } }                 → failed (not a Project Token)\n" +
      "  - Authorization: Bearer + estimatedUsage(measurements:[CPU_USAGE])      → failed (not a Team Token)\n" +
      "  - Authorization: Bearer + { me { id } }                                 → failed (not a PAT)\n" +
      "Possible causes: token expired, revoked, lacks billing scope, or wrong format. Re-issue in Railway dashboard.",
  );
};

// ─── Project name 批量拉取 ────────────────────────────────────────────────

/**
 * 一次 GraphQL 请求拉所有 projectId 的 name(aliased 子查询),省 N 次往返。
 * 失败的 project 返 null,UI 自己 fallback 显示 short id。
 */
const fetchProjectNames = async (
  token: string,
  projectIds: string[],
  authMode: RailwayAuthMode,
): Promise<Map<string, string>> => {
  if (projectIds.length === 0) return new Map();

  // alias 名只能含字母数字和下划线,把 UUID 的 dash 去掉
  const aliased = projectIds.map((id) => ({
    id,
    alias: `p_${id.replace(/-/g, "")}`,
  }));
  const query = `{ ${aliased
    .map((a) => `${a.alias}: project(id: "${a.id}") { id name }`)
    .join(" ")} }`;

  const headers: Record<string, string> =
    authMode.mode === "project"
      ? { "Project-Access-Token": token, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const res = await fetchWithRetry(RAILWAY_GRAPHQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    // 不阻塞主流程,返空 map → 各 project 显示 null name
    return new Map();
  }
  const json = (await res.json()) as GraphQLResponse<Record<string, { id: string; name: string } | null>>;
  // 即使部分 project 不存在(返 null),其他还能用,所以这里不严格挂掉
  const map = new Map<string, string>();
  for (const a of aliased) {
    const node = json.data?.[a.alias];
    if (node?.name) map.set(a.id, node.name);
  }
  return map;
};

// ─── 主流程 ────────────────────────────────────────────────────────────────

export const fetchRailwayDaily = async (): Promise<RailwayDailyCollected> => {
  const token = env.cost.railwayBillingToken ?? env.cost.railwayToken;
  if (!token) throw new Error("RAILWAY_BILLING_TOKEN (or RAILWAY_DATASOURCE_TOKEN) not configured");

  const auth = await detectRailwayAuthMode(token);

  // 根据 auth mode 决定 header + variables
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

  // 按 project 汇总(同 project 不同 measurement 累加)
  const projectCosts = new Map<string, number>();
  const fallbackProjectId = auth.mode === "project" ? auth.projectId : "unknown";
  for (const e of json.data?.estimatedUsage ?? []) {
    const price = RAILWAY_PRICES[e.measurement] ?? 0;
    const cost = Number(e.estimatedValue ?? 0) * price;
    const key = e.projectId ?? fallbackProjectId;
    projectCosts.set(key, (projectCosts.get(key) ?? 0) + cost);
  }

  // 取 name(allowed to fail, 继续)
  const projectIds = [...projectCosts.keys()].filter((id) => id !== "unknown");
  const names = await fetchProjectNames(token, projectIds, auth);

  const projects: RailwayProjectBreakdown[] = [...projectCosts.entries()]
    .map(([project_id, cost_usd]) => ({
      project_id,
      name: names.get(project_id) ?? null,
      cost_usd,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  return {
    monthlyEstimateUsd: projects.reduce((acc, p) => acc + p.cost_usd, 0),
    projects,
  };
};

// 暴露给单测用的内部成员
export const __internals = {
  RAILWAY_GRAPHQL,
  RAILWAY_MEASUREMENTS,
  RAILWAY_PRICES,
  PROBE_MEASUREMENT,
  probeProjectToken,
  probeBearerDirect,
  probeAccountToken,
  fetchProjectNames,
  resetAuthCache: () => {
    cachedAuthMode = null;
  },
};
