import type { GrowthMetrics, TimeSeriesPoint, UsageMetrics } from "../types";
import { env } from "../env";

interface HogqlResult {
  results: (string | number | null)[][];
  columns: string[];
}

const runHogql = async (query: string): Promise<HogqlResult> => {
  const { key, host } = env.posthog;
  if (!key) throw new Error("PostHog not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${host}/api/projects/@current/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      signal: controller.signal,
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as HogqlResult;
  } finally {
    clearTimeout(timer);
  }
};

const rowsToSeries = (rows: HogqlResult["results"]): TimeSeriesPoint[] =>
  rows.map(([day, val]) => ({ ts: String(day), value: Number(val ?? 0) }));

export const fetchGrowth = async (): Promise<GrowthMetrics> => {
  const dauSql = `
    SELECT toString(toDate(timestamp)) AS day, count(DISTINCT distinct_id) AS dau
    FROM events
    WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  `;
  const newUsersSql = `
    SELECT toString(toDate(timestamp)) AS day, count() AS n
    FROM events
    WHERE event = 'sign_up' AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  `;
  const mauSql = `
    SELECT count(DISTINCT distinct_id) AS mau
    FROM events
    WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
  `;

  const [dauRes, newRes, mauRes] = await Promise.all([
    runHogql(dauSql),
    runHogql(newUsersSql),
    runHogql(mauSql),
  ]);

  const dau = rowsToSeries(dauRes.results);
  const newUsersTrend = rowsToSeries(newRes.results);

  return {
    dau,
    mauCurrent: Number(mauRes.results[0]?.[0] ?? 0),
    newUsersToday: newUsersTrend.at(-1)?.value ?? 0,
    newUsersTrend,
  };
};

export const fetchUsage = async (): Promise<UsageMetrics> => {
  const tasksSql = `
    SELECT toString(toDate(timestamp)) AS day, count() AS n
    FROM events
    WHERE event = 'task_created' AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  `;
  const messagesSql = `
    SELECT toString(toDate(timestamp)) AS day, count() AS n
    FROM events
    WHERE event = 'message_sent' AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  `;

  const [tasksRes, msgsRes] = await Promise.all([
    runHogql(tasksSql),
    runHogql(messagesSql),
  ]);
  const tasksTrend = rowsToSeries(tasksRes.results);
  const messagesTrend = rowsToSeries(msgsRes.results);

  return {
    tasksTrend,
    tasksToday: tasksTrend.at(-1)?.value ?? 0,
    messagesTrend,
    messagesToday: messagesTrend.at(-1)?.value ?? 0,
  };
};
