import type { UpstreamStatus } from "../types";

interface StatuspageIoResp {
  status: {
    indicator: "none" | "minor" | "major" | "critical" | "maintenance";
    description: string;
  };
}

interface ProviderConfig {
  name: string;
  publicUrl: string;
  apiUrl: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "Sentry",
    publicUrl: "https://status.sentry.io/",
    apiUrl: "https://status.sentry.io/api/v2/status.json",
  },
  {
    name: "Vercel",
    publicUrl: "https://www.vercel-status.com/",
    apiUrl: "https://www.vercel-status.com/api/v2/status.json",
  },
  {
    name: "Cloudflare",
    publicUrl: "https://www.cloudflarestatus.com/",
    apiUrl: "https://www.cloudflarestatus.com/api/v2/status.json",
  },
  {
    name: "Anthropic",
    publicUrl: "https://status.anthropic.com/",
    apiUrl: "https://status.anthropic.com/api/v2/status.json",
  },
  {
    name: "OpenAI",
    publicUrl: "https://status.openai.com/",
    apiUrl: "https://status.openai.com/api/v2/status.json",
  },
  {
    name: "Railway",
    publicUrl: "https://railway.statuspage.io/",
    apiUrl: "https://railway.statuspage.io/api/v2/status.json",
  },
];

const mapIndicator = (indicator: string): UpstreamStatus["status"] => {
  if (indicator === "none") return "operational";
  if (indicator === "minor" || indicator === "maintenance") return "degraded";
  if (indicator === "major" || indicator === "critical") return "down";
  return "unknown";
};

export const fetchStatuspages = async (): Promise<UpstreamStatus[]> => {
  const now = new Date().toISOString();
  return Promise.all(
    PROVIDERS.map(async (p): Promise<UpstreamStatus> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(p.apiUrl, {
          signal: controller.signal,
          next: { revalidate: 60 },
        });
        clearTimeout(timer);
        if (!res.ok)
          return {
            name: p.name,
            status: "unknown",
            url: p.publicUrl,
            lastChecked: now,
          };
        const data = (await res.json()) as StatuspageIoResp;
        return {
          name: p.name,
          status: mapIndicator(data.status.indicator),
          url: p.publicUrl,
          lastChecked: now,
        };
      } catch {
        return {
          name: p.name,
          status: "unknown",
          url: p.publicUrl,
          lastChecked: now,
        };
      }
    }),
  );
};
