import type {
  BusinessTabData,
  CostTabData,
  CostTrendPoint,
  HealthTabData,
  MetricsResponse,
  SourceName,
  SourceStatus,
  TimeSeriesPoint,
} from "../types";

const buildSeries = (
  days: number,
  base: number,
  jitter: number,
): TimeSeriesPoint[] => {
  const points: TimeSeriesPoint[] = [];
  const dayMs = 86_400_000;
  const start = Date.now() - days * dayMs;
  for (let i = 0; i < days; i++) {
    const ts = new Date(start + i * dayMs).toISOString();
    const weekend = new Date(start + i * dayMs).getUTCDay() % 6 === 0 ? 0.7 : 1;
    const wave = Math.sin((i / days) * Math.PI * 2) * 0.15 + 1;
    const noise = (Math.sin(i * 9.7) + Math.cos(i * 4.1)) * 0.1;
    points.push({
      ts,
      value: Math.max(
        0,
        Math.round(base * weekend * wave * (1 + noise) + (i % 3) * jitter),
      ),
    });
  }
  return points;
};

const mockHealth = (): HealthTabData => ({
  upstream: [
    {
      name: "Sentry",
      status: "operational",
      url: "https://status.sentry.io/",
      lastChecked: new Date().toISOString(),
    },
    {
      name: "Vercel",
      status: "operational",
      url: "https://www.vercel-status.com/",
      lastChecked: new Date().toISOString(),
    },
    {
      name: "Cloudflare",
      status: "operational",
      url: "https://www.cloudflarestatus.com/",
      lastChecked: new Date().toISOString(),
    },
    {
      name: "Anthropic",
      status: "degraded",
      url: "https://status.anthropic.com/",
      lastChecked: new Date().toISOString(),
    },
    {
      name: "OpenAI",
      status: "operational",
      url: "https://status.openai.com/",
      lastChecked: new Date().toISOString(),
    },
    {
      name: "Google AI",
      status: "operational",
      url: "https://status.cloud.google.com/",
      lastChecked: new Date().toISOString(),
    },
  ],
  deploy: [
    {
      service: "mira-next",
      status: "SUCCESS",
      commitSha: "a3f1c8e9d2b4f5a6c7e8d9f0a1b2c3d4e5f6a7b8",
      commitMessage:
        "fix(sandbox): pre-create /mnt/task/output for ACS CSI ossfs mount",
      deployedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    },
    {
      service: "auth-proxy",
      status: "SUCCESS",
      commitSha: "9f2e1d8c7b6a5d4f3e2c1b0a9f8e7d6c5b4a3f2e",
      commitMessage: "chore: bump better-auth to 1.2.5",
      deployedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    },
  ],
  ping: {
    url: "https://mira.day/api/health",
    status: "up",
    latencyMs: 187,
    checkedAt: new Date().toISOString(),
  },
  apiSla: {
    errorRate1h: 0.0021,
    errorRate24h: 0.0034,
    p95LatencyMs: 824,
    p99LatencyMs: 1640,
    trend: buildSeries(24, 0.003, 0.0005),
    samplingNote: "Sentry 采样率 50%",
  },
  webVitals: {
    lcpP75: 1420,
    inpP75: 240,
    clsP75: 0.08,
    fcpP75: 920,
    ttfbP75: 320,
  },
  crashFree: { rate: 0.9987, totalSessions: 8432 },
  llmProviders: [
    { provider: "Anthropic", errorCount: 12 },
    { provider: "OpenAI", errorCount: 3 },
    { provider: "Google", errorCount: 1 },
    { provider: "Vercel Gateway", errorCount: 0 },
  ],
  sandbox: { totalRuns: 1247, errorCount: 18, errorRate: 0.0144 },
});

const mockBusiness = (): BusinessTabData => ({
  growth: {
    dau: buildSeries(30, 850, 20),
    mauCurrent: 12_438,
    newUsersToday: 142,
    newUsersTrend: buildSeries(30, 130, 8),
  },
  activationFunnel: [
    { name: "sign_up", count: 1842, conversionRate: 1.0 },
    { name: "email_verified", count: 1521, conversionRate: 0.826 },
    { name: "account_activated", count: 1284, conversionRate: 0.697 },
    { name: "task_created (first)", count: 1037, conversionRate: 0.563 },
  ],
  retention: [
    { cohort: "2026-W17", d1: 0.62, d7: 0.41, d30: 0.28 },
    { cohort: "2026-W18", d1: 0.65, d7: 0.43, d30: 0.27 },
    { cohort: "2026-W19", d1: 0.68, d7: 0.45, d30: null },
    { cohort: "2026-W20", d1: 0.71, d7: null, d30: null },
  ],
  usage: {
    tasksTrend: buildSeries(30, 280, 12),
    tasksToday: 312,
    messagesTrend: buildSeries(30, 1850, 60),
    messagesToday: 2104,
  },
  llm: {
    byModel: [
      {
        model: "claude-opus-4-7",
        taskCount: 142,
        totalTokens: 8_420_000,
        totalCost: 384.21,
      },
      {
        model: "claude-sonnet-4-6",
        taskCount: 318,
        totalTokens: 14_300_000,
        totalCost: 156.43,
      },
      {
        model: "gpt-4o",
        taskCount: 87,
        totalTokens: 3_120_000,
        totalCost: 78.42,
      },
      {
        model: "gemini-2.5-pro",
        taskCount: 24,
        totalTokens: 920_000,
        totalCost: 18.71,
      },
    ],
    totalTokens24h: 26_760_000,
    totalCost24h: 637.77,
    avgCostPerTask: 1.13,
    topTools: [
      { tool: "people_search", count: 412 },
      { tool: "code_interpreter", count: 287 },
      { tool: "exa_search", count: 198 },
      { tool: "files_write", count: 142 },
      { tool: "office_docx", count: 87 },
      { tool: "complete", count: 564 },
      { tool: "write_todos", count: 321 },
      { tool: "clarify_question", count: 156 },
    ],
  },
});

const buildCostTrend = (days: number): CostTrendPoint[] => {
  const series: CostTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.now() - (days - i) * 86_400_000).toISOString().slice(0, 10);
    const dow = new Date(day).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.55 : 1;
    series.push({
      date: day,
      ai_gateway: Math.round(560 * weekend * (1 + Math.sin(i / 5) * 0.22) + (i % 4) * 8),
      exa: Math.round(8 * weekend * (1 + Math.cos(i / 4) * 0.18) * 100) / 100,
      railway: Math.round(4.94 * 100) / 100,
      apollo: Math.round(78 * weekend * (1 + Math.sin(i / 7) * 0.12)),
    });
  }
  return series;
};

const mockCost = (): CostTabData => ({
  date: "2026-05-13",
  ai_gateway: {
    total_cost_usd: 630.56,
    balance_usd: 715.2,
    request_count: 14_237,
    tokens: {
      input: 45_400_000,
      output: 7_300_000,
      cache_read: 376_600_000,
      cache_write: 102_300_000,
    },
    top_models: [
      { model: "anthropic/claude-sonnet-4.6", cost_usd: 607.65, request_count: 5179 },
      { model: "anthropic/claude-haiku-4.5", cost_usd: 15.59, request_count: 4971 },
      { model: "xai/grok-4.1-fast-reasoning", cost_usd: 3.81, request_count: 2389 },
    ],
  },
  exa: {
    total_cost_usd: 9.33,
    items: [
      { name: "Summaries", cost_usd: 3.904, request_count: 3904 },
      { name: "Search", cost_usd: 3.437, request_count: 491 },
      { name: "Extra Search Results", cost_usd: 1.286, request_count: 1286 },
      { name: "Deep", cost_usd: 0.708, request_count: 59 },
    ],
  },
  railway: { monthly_estimate_usd: 148.09 },
  apollo: {
    estimated_cost_usd: 86.0,
    endpoints: [
      { endpoint: "contacts/bulk_create", request_count: 2 },
      { endpoint: "mixed_companies/search", request_count: 90 },
      { endpoint: "mixed_people/api_search", request_count: 80 },
    ],
  },
  trend30d: buildCostTrend(30),
});

export const mockResponse = (): MetricsResponse => {
  const sources: Record<SourceName, SourceStatus> = {
    posthog: { ok: false, configured: false, message: "mock" },
    langfuse: { ok: false, configured: false, message: "mock" },
    sentry: { ok: false, configured: false, message: "mock" },
    railway: { ok: false, configured: false, message: "mock" },
    statuspage: { ok: false, configured: true, message: "mock" },
    ping: { ok: false, configured: true, message: "mock" },
  };
  return {
    generatedAt: new Date().toISOString(),
    health: mockHealth(),
    business: mockBusiness(),
    cost: mockCost(),
    sources,
  };
};

export const mockHealthTab = mockHealth;
export const mockBusinessTab = mockBusiness;
export const mockCostTab = mockCost;
