// Apollo: POST /v1/usage_stats/api_usage_stats
// 返回每个 endpoint 的 day/hour/minute consumed 计数,不返金额
// estimatedCostUsd 字段先留 null,后续按 plan 拆账时可补
// 借鉴自 reference repo apps/mira-monitor/src/providers/apollo/client.ts

import { env } from "../../env";
import { fetchWithRetry } from "../fetch-with-retry";

const BASE_URL = "https://api.apollo.io/api/v1";

// 跟 reference repo 对齐:只跟踪这三条主用 endpoint
const APOLLO_TRACKED_ENDPOINTS: { key: string; apiPath: string; method: string }[] = [
  { key: "contacts/bulk_create", apiPath: "api/v1/contacts", method: "bulk_create" },
  { key: "mixed_companies/search", apiPath: "api/v1/mixed_companies", method: "search" },
  { key: "mixed_people/api_search", apiPath: "api/v1/mixed_people", method: "api_search" },
];

interface UsageBucket {
  consumed?: number;
  limit?: number;
}

interface UsageStatsEntry {
  day?: UsageBucket;
}

type ApolloUsageStatsResponse = Record<string, UsageStatsEntry>;

export interface ApolloDailyCollected {
  estimatedCostUsd: number | null;
  endpoints: { endpoint_key: string; consumed: number }[];
}

export const fetchApolloDaily = async (): Promise<ApolloDailyCollected> => {
  const apiKey = env.cost.apolloKey;
  if (!apiKey) throw new Error("APOLLO_MASTER_API_KEY not configured");

  const res = await fetchWithRetry(`${BASE_URL}/usage_stats/api_usage_stats`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Apollo usage_stats ${res.status}: ${await res.text()}`);
  const stats = (await res.json()) as ApolloUsageStatsResponse;

  // Apollo response key 是 JSON.stringify([apiPath, method]),要解析回来匹配
  const indexed = new Map<string, UsageStatsEntry>();
  for (const [rawKey, value] of Object.entries(stats)) {
    try {
      const parsed = JSON.parse(rawKey) as unknown;
      if (Array.isArray(parsed) && parsed.length === 2) {
        indexed.set(`${parsed[0]}|${parsed[1]}`, value);
      }
    } catch {
      // skip malformed keys
    }
  }

  const endpoints = APOLLO_TRACKED_ENDPOINTS.map((def) => ({
    endpoint_key: def.key,
    consumed: Number(indexed.get(`${def.apiPath}|${def.method}`)?.day?.consumed ?? 0),
  }));

  return { estimatedCostUsd: null, endpoints };
};
