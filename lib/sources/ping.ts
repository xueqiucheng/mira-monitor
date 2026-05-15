import type { PingResult } from "../types";
import { env } from "../env";

export const fetchPing = async (): Promise<PingResult> => {
  const url = env.ping.healthUrl;
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    return {
      url,
      status: res.ok ? "up" : "down",
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      url,
      status: "down",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
};
