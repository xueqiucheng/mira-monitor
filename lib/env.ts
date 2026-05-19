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
  }
};
