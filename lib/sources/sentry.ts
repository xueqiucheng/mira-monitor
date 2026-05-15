import type { ApiSlaMetrics, CrashFreeMetrics, TimeSeriesPoint, WebVitalsMetrics } from "../types";
import { env } from "../env";

const SENTRY_BASE = "https://us.sentry.io";
const SENTRY_GLOBAL = "https://sentry.io";

interface ProjectSummary {
  id: string;
  slug: string;
}

interface EventsStatsResponse {
  data: [number, { count: number }[]][];
}

interface EventsResponseRow {
  [field: string]: string | number | null;
}

interface EventsResponse {
  data: EventsResponseRow[];
}

interface SessionsGroup {
  totals: Record<string, number>;
}

interface SessionsResponse {
  groups: SessionsGroup[];
}

const authHeader = (): string => {
  const { token } = env.sentry;
  if (!token) throw new Error("Sentry not configured");
  return `Bearer ${token}`;
};

const sentryFetch = async <T>(url: string, timeoutMs = 12_000): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader() },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Sentry ${res.status}: ${body.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Sentry fetch failed");
};

let cachedProjectId: string | null = null;

const resolveProjectId = async (): Promise<string> => {
  if (cachedProjectId) return cachedProjectId;
  const { org, project } = env.sentry;
  if (!org || !project) throw new Error("Sentry org/project missing");
  const projects = await sentryFetch<ProjectSummary[]>(`${SENTRY_GLOBAL}/api/0/organizations/${org}/projects/`);
  const match = projects.find((p) => p.slug === project);
  if (!match) throw new Error(`Sentry project '${project}' not found in org '${org}'`);
  cachedProjectId = match.id;
  return cachedProjectId;
};

export const fetchApiSla = async (): Promise<ApiSlaMetrics> => {
  const { org } = env.sentry;
  const projectId = await resolveProjectId();
  const base = `${SENTRY_BASE}/api/0/organizations/${org}`;

  const errorQ = encodeURIComponent("event.type:error");
  const countF = encodeURIComponent("count()");
  const p95F = encodeURIComponent("p95(transaction.duration)");
  const p99F = encodeURIComponent("p99(transaction.duration)");

  const [errorTrend, txAgg24h, txAgg1h] = await Promise.all([
    sentryFetch<EventsStatsResponse>(
      `${base}/events-stats/?project=${projectId}&statsPeriod=24h&interval=1h&yAxis=count()&query=${errorQ}`,
    ),
    sentryFetch<EventsResponse>(
      `${base}/events/?project=${projectId}&statsPeriod=24h&dataset=transactions&field=${countF}&field=${p95F}&field=${p99F}`,
    ),
    sentryFetch<EventsResponse>(
      `${base}/events/?project=${projectId}&statsPeriod=1h&dataset=transactions&field=${countF}`,
    ),
  ]);

  const trend: TimeSeriesPoint[] = errorTrend.data.map(([ts, counts]) => ({
    ts: new Date(ts * 1000).toISOString(),
    value: counts[0]?.count ?? 0,
  }));
  const errors24h = trend.reduce((s, p) => s + p.value, 0);
  const errors1h = trend.at(-1)?.value ?? 0;
  const tx24hRow = txAgg24h.data[0] ?? {};
  const tx1hRow = txAgg1h.data[0] ?? {};
  const tx24h = Number(tx24hRow["count()"] ?? 0);
  const tx1h = Number(tx1hRow["count()"] ?? 0);
  const p95 = Number(tx24hRow["p95(transaction.duration)"] ?? NaN);
  const p99 = Number(tx24hRow["p99(transaction.duration)"] ?? NaN);

  return {
    errorRate1h: tx1h > 0 ? errors1h / tx1h : 0,
    errorRate24h: tx24h > 0 ? errors24h / tx24h : 0,
    p95LatencyMs: Number.isFinite(p95) && p95 > 0 ? p95 : null,
    p99LatencyMs: Number.isFinite(p99) && p99 > 0 ? p99 : null,
    trend,
    samplingNote: "Sentry 采样 50% · 高百分位有偏差",
  };
};

export const fetchWebVitals = async (): Promise<WebVitalsMetrics> => {
  const { org } = env.sentry;
  const projectId = await resolveProjectId();
  const fields = ["lcp", "inp", "cls", "fcp", "ttfb"]
    .map((m) => `field=${encodeURIComponent(`p75(measurements.${m})`)}`)
    .join("&");
  const resp = await sentryFetch<EventsResponse>(
    `${SENTRY_BASE}/api/0/organizations/${org}/events/?project=${projectId}&statsPeriod=24h&dataset=transactions&${fields}`,
  );
  const row = resp.data[0] ?? {};
  const get = (m: string): number | null => {
    const v = Number(row[`p75(measurements.${m})`] ?? NaN);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    lcpP75: get("lcp"),
    inpP75: get("inp"),
    clsP75: get("cls"),
    fcpP75: get("fcp"),
    ttfbP75: get("ttfb"),
  };
};

export const fetchCrashFree = async (): Promise<CrashFreeMetrics> => {
  const { org } = env.sentry;
  const projectId = await resolveProjectId();
  const fields = ["crash_free_rate(session)", "sum(session)"]
    .map((f) => `field=${encodeURIComponent(f)}`)
    .join("&");
  const resp = await sentryFetch<SessionsResponse>(
    `${SENTRY_BASE}/api/0/organizations/${org}/sessions/?project=${projectId}&statsPeriod=24h&${fields}`,
  );
  const totals = resp.groups[0]?.totals ?? {};
  return {
    rate: Number(totals["crash_free_rate(session)"] ?? 1),
    totalSessions: Number(totals["sum(session)"] ?? 0),
  };
};
