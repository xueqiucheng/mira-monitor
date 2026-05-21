// 从 Postgres 4 张 cost_*_daily 表读出 Cost Tab 数据
// 跟 lib/types.ts CostTabData 形状一对一对齐 — UI 完全不用改

import type {
  AIGatewayCost,
  ApolloCost,
  CostTabData,
  CostTrendPoint,
  ExaCost,
  RailwayCost,
} from "../types";
import { getPool } from "../db/postgres";
import { runMigrations } from "../db/migrate";
import { getBeijingDayWindow } from "./beijing-day";

interface AiGatewayRow {
  beijing_date: Date;
  cost_usd: string;
  balance_usd: string;
  request_count: string;
  input_tokens: string;
  output_tokens: string;
  cached_input_tokens: string;
  cache_creation_tokens: string;
  top_models: { model: string; cost_usd: number; request_count: number }[];
}

interface ExaRow {
  cost_usd: string;
  breakdown: { price_name: string; quantity: number; amount_usd: number }[];
}

interface RailwayRow {
  monthly_estimate_usd: string;
  projects: { project_id: string; name?: string | null; cost_usd: number }[] | null;
}

interface ApolloRow {
  estimated_cost_usd: string | null;
  endpoints: { endpoint_key: string; consumed: number }[];
}

interface TrendRow {
  date: Date;
  ai_gateway: string;
  exa: string;
  railway: string;
  apollo: string;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

const isoDate = (d: Date | string): string => {
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const readAiGateway = async (beijingDate: string): Promise<AIGatewayCost | null> => {
  const { rows } = await getPool().query<AiGatewayRow>(
    `SELECT beijing_date, cost_usd, balance_usd, request_count,
            input_tokens, output_tokens, cached_input_tokens, cache_creation_tokens, top_models
     FROM cost_ai_gateway_daily WHERE beijing_date = $1`,
    [beijingDate],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    total_cost_usd: num(r.cost_usd),
    balance_usd: num(r.balance_usd),
    request_count: num(r.request_count),
    tokens: {
      input: num(r.input_tokens),
      output: num(r.output_tokens),
      cache_read: num(r.cached_input_tokens),
      cache_write: num(r.cache_creation_tokens),
    },
    top_models: r.top_models.map((m) => ({
      model: m.model,
      cost_usd: num(m.cost_usd),
      request_count: num(m.request_count),
    })),
  };
};

const readExa = async (beijingDate: string): Promise<ExaCost | null> => {
  const { rows } = await getPool().query<ExaRow>(
    `SELECT cost_usd, breakdown FROM cost_exa_daily WHERE beijing_date = $1`,
    [beijingDate],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    total_cost_usd: num(r.cost_usd),
    items: r.breakdown.map((b) => ({
      name: b.price_name,
      cost_usd: num(b.amount_usd),
      request_count: num(b.quantity),
    })),
  };
};

const readRailway = async (beijingDate: string): Promise<RailwayCost | null> => {
  const { rows } = await getPool().query<RailwayRow>(
    `SELECT monthly_estimate_usd, projects FROM cost_railway_daily WHERE beijing_date = $1`,
    [beijingDate],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    monthly_estimate_usd: num(r.monthly_estimate_usd),
    projects: (r.projects ?? [])
      .map((p) => ({
        project_id: p.project_id,
        // 老数据没有 name 字段,容错回 null
        name: p.name ?? null,
        cost_usd: num(p.cost_usd),
      }))
      // 防御:DB 里如果没排序,这里强排一次
      .sort((a, b) => b.cost_usd - a.cost_usd),
  };
};

const readApollo = async (beijingDate: string): Promise<ApolloCost | null> => {
  const { rows } = await getPool().query<ApolloRow>(
    `SELECT estimated_cost_usd, endpoints FROM cost_apollo_daily WHERE beijing_date = $1`,
    [beijingDate],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    estimated_cost_usd: num(r.estimated_cost_usd),
    endpoints: r.endpoints.map((e) => ({
      endpoint: e.endpoint_key,
      request_count: num(e.consumed),
    })),
  };
};

// 30 天趋势,LEFT JOIN 4 张表,Railway 用 MTD 差值 (今日 - 昨日) 还原当日开销
// 跨月或缺数据时 fallback 用 MTD / day_of_month 做平滑估算,避免月初出现"昨日 = -X"的负值
const readTrend30d = async (): Promise<CostTrendPoint[]> => {
  const { rows } = await getPool().query<TrendRow>(
    `SELECT
       d::date AS date,
       COALESCE(g.cost_usd, 0)::text             AS ai_gateway,
       COALESCE(e.cost_usd, 0)::text             AS exa,
       COALESCE(
         CASE
           WHEN r_prev.monthly_estimate_usd IS NOT NULL
                AND DATE_TRUNC('month', d::date) = DATE_TRUNC('month', d::date - INTERVAL '1 day')
           THEN GREATEST(r.monthly_estimate_usd - r_prev.monthly_estimate_usd, 0)
           WHEN r.monthly_estimate_usd IS NOT NULL
           THEN r.monthly_estimate_usd / GREATEST(EXTRACT(DAY FROM d::date)::numeric, 1)
           ELSE 0
         END, 0
       )::text                                    AS railway,
       COALESCE(a.estimated_cost_usd, 0)::text   AS apollo
     FROM generate_series(
       (CURRENT_DATE - INTERVAL '29 days')::date,
       CURRENT_DATE,
       INTERVAL '1 day'
     ) AS d
     LEFT JOIN cost_ai_gateway_daily g ON g.beijing_date = d::date
     LEFT JOIN cost_exa_daily        e ON e.beijing_date = d::date
     LEFT JOIN cost_railway_daily    r ON r.beijing_date = d::date
     LEFT JOIN cost_railway_daily    r_prev ON r_prev.beijing_date = (d::date - INTERVAL '1 day')::date
     LEFT JOIN cost_apollo_daily     a ON a.beijing_date = d::date
     ORDER BY d`,
  );
  return rows.map((r) => ({
    date: isoDate(r.date),
    ai_gateway: num(r.ai_gateway),
    exa: num(r.exa),
    railway: num(r.railway),
    apollo: num(r.apollo),
  }));
};

const empty = (): CostTabData => ({
  date: getBeijingDayWindow().beijingDate,
  ai_gateway: {
    total_cost_usd: 0,
    balance_usd: 0,
    request_count: 0,
    tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    top_models: [],
  },
  exa: { total_cost_usd: 0, items: [] },
  railway: { monthly_estimate_usd: 0, projects: [] },
  apollo: { estimated_cost_usd: 0, endpoints: [] },
  trend30d: [],
});

export const fetchCostTab = async (): Promise<CostTabData> => {
  // 幂等迁移:首次 ingest 还没跑的话,Cost Tab 读 4 张表会报 "relation does not exist"。
  // runMigrations() 自带 module-level flag,每个 Node 进程只跑一次;
  // pg_advisory_lock 防 web/cron 同时跑互相打架。
  await runMigrations();
  const today = getBeijingDayWindow().beijingDate;
  const baseline = empty();
  baseline.date = today;

  const [ag, ex, rw, ap, trend] = await Promise.all([
    readAiGateway(today),
    readExa(today),
    readRailway(today),
    readApollo(today),
    readTrend30d(),
  ]);

  if (ag) baseline.ai_gateway = ag;
  if (ex) baseline.exa = ex;
  if (rw) baseline.railway = rw;
  if (ap) baseline.apollo = ap;
  baseline.trend30d = trend;
  return baseline;
};
