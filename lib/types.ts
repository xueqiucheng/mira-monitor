export type SourceName =
  | "posthog"
  | "langfuse"
  | "sentry"
  | "railway"
  | "statuspage"
  | "ping";

export interface SourceStatus {
  ok: boolean;
  configured: boolean;
  message?: string;
}

export interface TimeSeriesPoint {
  ts: string;
  value: number;
}

export interface UpstreamStatus {
  name: string;
  status: "operational" | "degraded" | "down" | "unknown";
  url: string;
  lastChecked: string;
}

export interface DeployStatus {
  service: string;
  status:
    | "SUCCESS"
    | "FAILED"
    | "CRASHED"
    | "BUILDING"
    | "DEPLOYING"
    | "UNKNOWN";
  commitSha: string | null;
  commitMessage: string | null;
  deployedAt: string | null;
}

export interface PingResult {
  url: string;
  status: "up" | "down";
  latencyMs: number | null;
  checkedAt: string;
}

export interface ApiSlaMetrics {
  errorRate1h: number;
  errorRate24h: number;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  trend: TimeSeriesPoint[];
  samplingNote?: string;
}

export interface WebVitalsMetrics {
  lcpP75: number | null;
  inpP75: number | null;
  clsP75: number | null;
  fcpP75: number | null;
  ttfbP75: number | null;
}

export interface CrashFreeMetrics {
  rate: number;
  totalSessions: number;
}

export interface ProviderError {
  provider: string;
  errorCount: number;
}

export interface SandboxMetrics {
  totalRuns: number;
  errorCount: number;
  errorRate: number;
}

export interface HealthTabData {
  upstream: UpstreamStatus[];
  deploy: DeployStatus[];
  ping: PingResult;
  apiSla: ApiSlaMetrics;
  webVitals: WebVitalsMetrics;
  crashFree: CrashFreeMetrics;
  llmProviders: ProviderError[];
  sandbox: SandboxMetrics;
}

export interface GrowthMetrics {
  dau: TimeSeriesPoint[];
  mauCurrent: number;
  newUsersToday: number;
  newUsersTrend: TimeSeriesPoint[];
}

export interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
}

export interface RetentionRow {
  cohort: string;
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

export interface UsageMetrics {
  tasksTrend: TimeSeriesPoint[];
  tasksToday: number;
  messagesTrend: TimeSeriesPoint[];
  messagesToday: number;
}

export interface ModelUsage {
  model: string;
  taskCount: number;
  totalTokens: number;
  totalCost: number;
}

export interface ToolUsage {
  tool: string;
  count: number;
}

export interface LlmMetrics {
  byModel: ModelUsage[];
  totalTokens24h: number;
  totalCost24h: number;
  avgCostPerTask: number;
  topTools: ToolUsage[];
}

export interface BusinessTabData {
  growth: GrowthMetrics;
  activationFunnel: FunnelStep[];
  retention: RetentionRow[];
  usage: UsageMetrics;
  llm: LlmMetrics;
}

export interface AIGatewayModelCost {
  model: string;
  cost_usd: number;
  request_count: number;
}

export interface AIGatewayCost {
  total_cost_usd: number;
  balance_usd: number;
  request_count: number;
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  top_models: AIGatewayModelCost[];
}

export interface ExaLineItem {
  name: string;
  cost_usd: number;
  request_count: number;
}

export interface ExaCost {
  total_cost_usd: number;
  items: ExaLineItem[];
}

export interface RailwayCost {
  monthly_estimate_usd: number;
}

export interface ApolloEndpoint {
  endpoint: string;
  request_count: number;
}

export interface ApolloCost {
  estimated_cost_usd: number;
  endpoints: ApolloEndpoint[];
}

export interface CostTrendPoint {
  date: string;
  ai_gateway: number;
  exa: number;
  railway: number;
  apollo: number;
}

export interface CostTabData {
  date: string;
  ai_gateway: AIGatewayCost;
  exa: ExaCost;
  railway: RailwayCost;
  apollo: ApolloCost;
  trend30d: CostTrendPoint[];
}

export interface MetricsResponse {
  generatedAt: string;
  health: HealthTabData;
  business: BusinessTabData;
  cost: CostTabData;
  sources: Record<SourceName, SourceStatus>;
}
