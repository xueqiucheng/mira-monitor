import type {
  BusinessTabData,
  CostTabData,
  HealthTabData,
  MetricsResponse,
  SourceName,
  SourceStatus,
} from "../types";
import { isConfigured } from "../env";
import { isPostgresConfigured } from "../db/postgres";
import { fetchCostTab } from "../cost/read";
import { fetchPing } from "./ping";
import { fetchStatuspages } from "./statuspage";
import { fetchRailwayDeployments } from "./railway";
import { fetchGrowth, fetchUsage } from "./posthog";
import { fetchLlmMetrics } from "./langfuse";
import { fetchApiSla, fetchCrashFree, fetchWebVitals } from "./sentry";

const settled = <T>(p: Promise<T>): Promise<PromiseSettledResult<T>> =>
  p.then(
    (value): PromiseFulfilledResult<T> => ({ status: "fulfilled", value }),
    (reason: unknown): PromiseRejectedResult => ({
      status: "rejected",
      reason,
    }),
  );

const emptyHealth = (): HealthTabData => ({
  upstream: [],
  deploy: [],
  ping: null,
  apiSla: null,
  webVitals: null,
  crashFree: null,
  llmProviders: [],
  sandbox: null,
});

const emptyBusiness = (): BusinessTabData => ({
  growth: null,
  activationFunnel: [],
  retention: [],
  usage: null,
  llm: null,
});

const emptyCost = (): CostTabData => ({
  date: null,
  ai_gateway: null,
  exa: null,
  railway: null,
  apollo: null,
  trend30d: [],
});

export const fetchMetrics = async (): Promise<MetricsResponse> => {
  const health = emptyHealth();
  const business = emptyBusiness();
  let cost = emptyCost();
  const sources: Record<SourceName, SourceStatus> = {
    posthog: { ok: false, configured: isConfigured("posthog") },
    langfuse: { ok: false, configured: isConfigured("langfuse") },
    sentry: { ok: false, configured: isConfigured("sentry") },
    railway: { ok: false, configured: isConfigured("railway") },
    statuspage: { ok: false, configured: true },
    ping: { ok: false, configured: true },
    cost: { ok: false, configured: isPostgresConfigured() },
  };

  const [pingR, upstreamR, deployR, growthR, usageR, llmR, slaR, vitalsR, crashFreeR, costR] = await Promise.all([
    settled(fetchPing()),
    settled(fetchStatuspages()),
    isConfigured("railway")
      ? settled(fetchRailwayDeployments())
      : Promise.resolve(null),
    isConfigured("posthog") ? settled(fetchGrowth()) : Promise.resolve(null),
    isConfigured("posthog") ? settled(fetchUsage()) : Promise.resolve(null),
    isConfigured("langfuse") ? settled(fetchLlmMetrics()) : Promise.resolve(null),
    isConfigured("sentry") ? settled(fetchApiSla()) : Promise.resolve(null),
    isConfigured("sentry") ? settled(fetchWebVitals()) : Promise.resolve(null),
    isConfigured("sentry") ? settled(fetchCrashFree()) : Promise.resolve(null),
    isPostgresConfigured() ? settled(fetchCostTab()) : Promise.resolve(null),
  ]);

  if (pingR.status === "fulfilled") {
    health.ping = pingR.value;
    sources.ping = { ok: true, configured: true };
  } else {
    sources.ping = {
      ok: false,
      configured: true,
      message: String(pingR.reason),
    };
  }

  if (upstreamR.status === "fulfilled") {
    health.upstream = upstreamR.value;
    sources.statuspage = { ok: true, configured: true };
  } else {
    sources.statuspage = {
      ok: false,
      configured: true,
      message: String(upstreamR.reason),
    };
  }

  if (deployR && deployR.status === "fulfilled" && deployR.value.length > 0) {
    health.deploy = deployR.value;
    sources.railway = { ok: true, configured: true };
  } else if (deployR) {
    sources.railway = {
      ok: false,
      configured: true,
      message:
        deployR.status === "rejected"
          ? String(deployR.reason)
          : "no deployments returned",
    };
  }

  if (growthR && growthR.status === "fulfilled") {
    business.growth = growthR.value;
  }
  if (usageR && usageR.status === "fulfilled") {
    business.usage = usageR.value;
  }
  if (growthR || usageR) {
    const growthOk = growthR?.status === "fulfilled";
    const usageOk = usageR?.status === "fulfilled";
    sources.posthog = {
      ok: growthOk && usageOk,
      configured: true,
      message: growthOk && usageOk ? undefined : "partial fetch failure",
    };
  }

  if (llmR) {
    if (llmR.status === "fulfilled") {
      business.llm = llmR.value;
      sources.langfuse = { ok: true, configured: true };
    } else {
      sources.langfuse = { ok: false, configured: true, message: String(llmR.reason) };
    }
  }

  if (slaR || vitalsR || crashFreeR) {
    if (slaR?.status === "fulfilled") health.apiSla = slaR.value;
    if (vitalsR?.status === "fulfilled") health.webVitals = vitalsR.value;
    if (crashFreeR?.status === "fulfilled") health.crashFree = crashFreeR.value;
    const allOk = [slaR, vitalsR, crashFreeR].every((r) => r?.status === "fulfilled");
    const firstErr = [slaR, vitalsR, crashFreeR].find((r) => r?.status === "rejected");
    sources.sentry = {
      ok: allOk,
      configured: true,
      message: allOk ? undefined : firstErr?.status === "rejected" ? String(firstErr.reason) : "partial fetch failure",
    };
  }

  if (costR) {
    if (costR.status === "fulfilled") {
      cost = costR.value;
      sources.cost = { ok: true, configured: true };
    } else {
      sources.cost = { ok: false, configured: true, message: String(costR.reason) };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    health,
    business,
    cost,
    sources,
  };
};
