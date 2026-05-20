// Daily cost ingest 编排
// 跑法 1: 内部 HTTP POST /api/ingest/cost (由 cron sibling service 触发)
// 跑法 2: 本地 `bun run scripts/ingest-cost.ts` (debug / 回填)
//
// 任一 provider 失败不阻断其他 — 失败的省略对应 UPSERT,日志里记 reason

import { getPool } from "../db/postgres";
import { runMigrations } from "../db/migrate";
import { beijingDateFromIso, getBeijingDayWindow } from "./beijing-day";
import { fetchAiGatewayDaily } from "./providers/ai-gateway";
import { fetchApolloDaily } from "./providers/apollo";
import { fetchExaDaily } from "./providers/exa";
import { fetchRailwayDaily } from "./providers/railway-billing";

export interface IngestProviderResult {
  ok: boolean;
  message?: string;
}

export interface IngestReport {
  beijingDate: string;
  startedAt: string;
  finishedAt: string;
  ai_gateway: IngestProviderResult;
  exa: IngestProviderResult;
  railway: IngestProviderResult;
  apollo: IngestProviderResult;
}

const ingestAiGateway = async (beijingDate: string): Promise<IngestProviderResult> => {
  try {
    const data = await fetchAiGatewayDaily(beijingDate);
    await getPool().query(
      `INSERT INTO cost_ai_gateway_daily (
         beijing_date, cost_usd, balance_usd, request_count,
         input_tokens, output_tokens, cached_input_tokens, cache_creation_tokens,
         top_models, collected_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
       ON CONFLICT (beijing_date) DO UPDATE SET
         cost_usd = EXCLUDED.cost_usd,
         balance_usd = EXCLUDED.balance_usd,
         request_count = EXCLUDED.request_count,
         input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens,
         cached_input_tokens = EXCLUDED.cached_input_tokens,
         cache_creation_tokens = EXCLUDED.cache_creation_tokens,
         top_models = EXCLUDED.top_models,
         collected_at = now()`,
      [
        beijingDate,
        data.costUsd,
        data.balanceUsd,
        data.requestCount,
        data.inputTokens,
        data.outputTokens,
        data.cachedInputTokens,
        data.cacheCreationTokens,
        JSON.stringify(data.topModels),
      ],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

const ingestExa = async (beijingDate: string, startIso: string, endIso: string): Promise<IngestProviderResult> => {
  try {
    const data = await fetchExaDaily(startIso, endIso);
    await getPool().query(
      `INSERT INTO cost_exa_daily (beijing_date, cost_usd, breakdown, collected_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (beijing_date) DO UPDATE SET
         cost_usd = EXCLUDED.cost_usd,
         breakdown = EXCLUDED.breakdown,
         collected_at = now()`,
      [beijingDate, data.costUsd, JSON.stringify(data.breakdown)],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

const ingestRailway = async (beijingDate: string): Promise<IngestProviderResult> => {
  try {
    const data = await fetchRailwayDaily();
    await getPool().query(
      `INSERT INTO cost_railway_daily (beijing_date, monthly_estimate_usd, projects, collected_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (beijing_date) DO UPDATE SET
         monthly_estimate_usd = EXCLUDED.monthly_estimate_usd,
         projects = EXCLUDED.projects,
         collected_at = now()`,
      [beijingDate, data.monthlyEstimateUsd, JSON.stringify(data.projects)],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

const ingestApollo = async (beijingDate: string): Promise<IngestProviderResult> => {
  try {
    const data = await fetchApolloDaily();
    await getPool().query(
      `INSERT INTO cost_apollo_daily (beijing_date, estimated_cost_usd, endpoints, collected_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (beijing_date) DO UPDATE SET
         estimated_cost_usd = EXCLUDED.estimated_cost_usd,
         endpoints = EXCLUDED.endpoints,
         collected_at = now()`,
      [beijingDate, data.estimatedCostUsd, JSON.stringify(data.endpoints)],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

// dateOverride: YYYY-MM-DD,用来回填某一天(常态空)
export const runDailyCostIngest = async (dateOverride?: string): Promise<IngestReport> => {
  await runMigrations();
  const window = dateOverride ? beijingDateFromIso(dateOverride) : getBeijingDayWindow();
  const startIso = new Date(window.utcStartMs).toISOString();
  const endIso = new Date(window.utcEndMs).toISOString();
  const startedAt = new Date().toISOString();

  const [ai_gateway, exa, railway, apollo] = await Promise.all([
    ingestAiGateway(window.beijingDate),
    ingestExa(window.beijingDate, startIso, endIso),
    ingestRailway(window.beijingDate),
    ingestApollo(window.beijingDate),
  ]);

  return {
    beijingDate: window.beijingDate,
    startedAt,
    finishedAt: new Date().toISOString(),
    ai_gateway,
    exa,
    railway,
    apollo,
  };
};
