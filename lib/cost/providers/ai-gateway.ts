// Vercel AI Gateway: GET /v1/credits + GET /v1/report
// 文档: https://ai-gateway.vercel.sh
// 客户端结构借鉴自 reference repo apps/mira-monitor/src/providers/ai-gateway/client.ts

import { env } from "../../env";
import { fetchWithRetry } from "../fetch-with-retry";

const BASE_URL = "https://ai-gateway.vercel.sh/v1";

interface AiGatewayCreditsResponse {
  balance: string;
  total_used: string;
}

interface AiGatewayReportRow {
  day?: string;
  model?: string;
  total_cost: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  request_count: number;
}

interface AiGatewayReportResponse {
  results: AiGatewayReportRow[];
}

export interface AiGatewayDailyCollected {
  costUsd: number;
  balanceUsd: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  topModels: { model: string; cost_usd: number; request_count: number }[];
}

const authHeaders = (apiKey: string): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

const getCredits = async (apiKey: string): Promise<AiGatewayCreditsResponse> => {
  const res = await fetchWithRetry(`${BASE_URL}/credits`, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error(`AI Gateway /credits ${res.status}: ${await res.text()}`);
  return (await res.json()) as AiGatewayCreditsResponse;
};

const getReport = async (
  apiKey: string,
  params: { startDate: string; endDate: string; groupBy?: "model" },
): Promise<AiGatewayReportResponse> => {
  const qs = new URLSearchParams({
    start_date: params.startDate,
    end_date: params.endDate,
    date_part: "day",
  });
  if (params.groupBy) qs.set("group_by", params.groupBy);
  const res = await fetchWithRetry(`${BASE_URL}/report?${qs.toString()}`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`AI Gateway /report ${res.status}: ${await res.text()}`);
  return (await res.json()) as AiGatewayReportResponse;
};

const sum = (rows: AiGatewayReportRow[]) =>
  rows.reduce(
    (acc, r) => {
      acc.costUsd += Number(r.total_cost ?? 0);
      acc.requestCount += Number(r.request_count ?? 0);
      acc.inputTokens += Number(r.input_tokens ?? 0);
      acc.outputTokens += Number(r.output_tokens ?? 0);
      acc.cachedInputTokens += Number(r.cached_input_tokens ?? 0);
      acc.cacheCreationTokens += Number(r.cache_creation_input_tokens ?? 0);
      return acc;
    },
    { costUsd: 0, requestCount: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0 },
  );

export const fetchAiGatewayDaily = async (beijingDate: string): Promise<AiGatewayDailyCollected> => {
  const apiKey = env.cost.aiGatewayKey;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY not configured");

  const [credits, totalReport, modelReport] = await Promise.all([
    getCredits(apiKey),
    getReport(apiKey, { startDate: beijingDate, endDate: beijingDate }),
    getReport(apiKey, { startDate: beijingDate, endDate: beijingDate, groupBy: "model" }),
  ]);

  const agg = sum(totalReport.results);
  const topModels = [...modelReport.results]
    .sort((a, b) => Number(b.total_cost ?? 0) - Number(a.total_cost ?? 0))
    .slice(0, 5)
    .map((r) => ({
      model: r.model ?? "unknown",
      cost_usd: Number(r.total_cost ?? 0),
      request_count: Number(r.request_count ?? 0),
    }));

  return {
    costUsd: agg.costUsd,
    balanceUsd: Number.parseFloat(credits.balance),
    requestCount: agg.requestCount,
    inputTokens: agg.inputTokens,
    outputTokens: agg.outputTokens,
    cachedInputTokens: agg.cachedInputTokens,
    cacheCreationTokens: agg.cacheCreationTokens,
    topModels,
  };
};
