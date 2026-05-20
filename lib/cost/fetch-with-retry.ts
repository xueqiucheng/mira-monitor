// 网络抖动重试(EAI_AGAIN / ECONNRESET / ETIMEDOUT 等),非 5xx
// 借鉴自 reference repo (apps/mira-monitor/src/providers/fetch-with-retry.ts)

const RETRYABLE_ERROR_CODES = new Set([
  "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

export const fetchWithRetry = async (
  url: string,
  init?: RequestInit,
  maxAttempts = 3,
): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string })?.code;
      if (!code || !RETRYABLE_ERROR_CODES.has(code)) throw error;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }
  throw lastError;
};
