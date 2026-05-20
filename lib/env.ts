import type { SourceName } from "./types";

const read = (name: string): string | null => {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : null;
};

export const env = {
  basicAuth: {
    user: read("DASHBOARD_BASIC_AUTH_USER") ?? "admin",
    pass: read("DASHBOARD_BASIC_AUTH_PASS"),
  },
  posthog: {
    key: read("POSTHOG_PERSONAL_API_KEY"),
    host: read("POSTHOG_HOST") ?? "https://us.posthog.com",
  },
  langfuse: {
    publicKey: read("LANGFUSE_PUBLIC_KEY"),
    secretKey: read("LANGFUSE_SECRET_KEY"),
    host: read("LANGFUSE_HOST") ?? "https://cloud.langfuse.com",
  },
  sentry: {
    token: read("SENTRY_AUTH_TOKEN"),
    org: read("SENTRY_ORG"),
    project: read("SENTRY_PROJECT"),
  },
  railway: {
    // 用 _DATASOURCE_ 前缀避免与 Railway 平台自动注入的 RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_ID 撞名
    token: read("RAILWAY_DATASOURCE_TOKEN"),
    projectId: read("RAILWAY_DATASOURCE_PROJECT_ID"),
    environmentId: read("RAILWAY_DATASOURCE_ENVIRONMENT_ID"),
  },
  ping: {
    healthUrl: read("MIRA_HEALTH_URL") ?? "https://mira.day/api/health",
  },
  // ─── Cost ingest ────────────────────────────────────────────
  // 由 cron sibling service 北京 8:00-23:30 每 30 分钟触发 ingest endpoint(一天 32 次)
  // ingest 落 4 张 Postgres 表(cost_*_daily),web service 渲染 Cost Tab 时读这些表
  cost: {
    aiGatewayKey: read("AI_GATEWAY_API_KEY"),
    exaServiceKey: read("EXA_SERVICE_KEY"),
    exaApiKeyIds: (read("EXA_API_KEY_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    // Railway 计费查询需要 account-scoped token,Project Token 不行(estimatedUsage 报 Not Authorized)
    // 优先用 RAILWAY_BILLING_TOKEN(在 Railway → Account Settings → Tokens 创建),
    // fallback 到 RAILWAY_DATASOURCE_TOKEN(向后兼容,仅当 datasource token 本身是 account-scoped 时有用)
    railwayBillingToken: read("RAILWAY_BILLING_TOKEN"),
    railwayToken: read("RAILWAY_DATASOURCE_TOKEN"),
    apolloKey: read("APOLLO_MASTER_API_KEY"),
    ingestToken: read("COST_INGEST_TOKEN"),
  },
};

export const isConfigured = (source: SourceName): boolean => {
  switch (source) {
    case "posthog":
      return !!env.posthog.key;
    case "langfuse":
      return !!(env.langfuse.publicKey && env.langfuse.secretKey);
    case "sentry":
      return !!(env.sentry.token && env.sentry.org && env.sentry.project);
    case "railway":
      return !!(
        env.railway.token &&
        env.railway.projectId &&
        env.railway.environmentId
      );
    case "statuspage":
    case "ping":
      return true;
    case "cost":
      // cost 走的是 lib/db/postgres.ts 的 isPostgresConfigured() 判断,这里只做兜底
      return !!process.env.DATABASE_URL?.trim();
  }
};
