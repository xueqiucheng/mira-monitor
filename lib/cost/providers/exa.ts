// Exa: GET admin-api.exa.ai/team-management/api-keys/{id}/usage
// 多 key 时并发拉取再合并 cost_breakdown
// 借鉴自 reference repo apps/mira-monitor/src/providers/exa/client.ts

import { env } from "../../env";
import { fetchWithRetry } from "../fetch-with-retry";

const BASE_URL = "https://admin-api.exa.ai";

interface ExaCostBreakdownEntry {
  price_id?: string;
  price_name?: string;
  quantity?: number;
  amount_usd?: number;
}

interface ExaUsageResponse {
  total_cost_usd?: number;
  cost_breakdown?: ExaCostBreakdownEntry[];
}

export interface ExaDailyCollected {
  costUsd: number;
  breakdown: { price_name: string; quantity: number; amount_usd: number }[];
}

const getApiKeyUsage = async (
  serviceKey: string,
  apiKeyId: string,
  startIso: string,
  endIso: string,
): Promise<ExaUsageResponse> => {
  const qs = new URLSearchParams({ start_date: startIso, end_date: endIso });
  const url = `${BASE_URL}/team-management/api-keys/${encodeURIComponent(apiKeyId)}/usage?${qs}`;
  const res = await fetchWithRetry(url, {
    headers: { "x-api-key": serviceKey, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Exa usage ${res.status}: ${await res.text()}`);
  return (await res.json()) as ExaUsageResponse;
};

export const fetchExaDaily = async (
  utcStartIso: string,
  utcEndIso: string,
): Promise<ExaDailyCollected> => {
  const serviceKey = env.cost.exaServiceKey;
  if (!serviceKey) throw new Error("EXA_SERVICE_KEY not configured");
  if (env.cost.exaApiKeyIds.length === 0) throw new Error("EXA_API_KEY_IDS not configured");

  const results = await Promise.all(
    env.cost.exaApiKeyIds.map((id) => getApiKeyUsage(serviceKey, id, utcStartIso, utcEndIso)),
  );

  let costUsd = 0;
  const merged = new Map<string, { price_name: string; quantity: number; amount_usd: number }>();
  for (const res of results) {
    costUsd += Number(res.total_cost_usd ?? 0);
    for (const b of res.cost_breakdown ?? []) {
      const name = b.price_name ?? b.price_id ?? "unknown";
      const existing = merged.get(name);
      const qty = Number(b.quantity ?? 0);
      const amt = Number(b.amount_usd ?? 0);
      if (existing) {
        existing.quantity += qty;
        existing.amount_usd += amt;
      } else {
        merged.set(name, { price_name: name, quantity: qty, amount_usd: amt });
      }
    }
  }

  const breakdown = [...merged.values()].sort((a, b) => b.amount_usd - a.amount_usd);
  return { costUsd, breakdown };
};
