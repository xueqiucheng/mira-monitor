export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export const fetchJson = async <T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> => {
  const { timeoutMs = 8000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};
