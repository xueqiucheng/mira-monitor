import type { SourceStatus, WebVitalsMetrics } from "@/lib/types";
import { CardShell } from "./card-shell";
import { cn } from "@/lib/utils";

interface Threshold {
  good: number;
  needsImprovement: number;
}

const THRESHOLDS: Record<string, Threshold> = {
  LCP: { good: 1500, needsImprovement: 2500 },
  INP: { good: 280, needsImprovement: 500 },
  CLS: { good: 0.13, needsImprovement: 0.25 },
  FCP: { good: 1000, needsImprovement: 1800 },
  TTFB: { good: 250, needsImprovement: 800 },
};

const ratingColor = (key: string, value: number | null): string => {
  if (value === null) return "text-muted-foreground";
  const t = THRESHOLDS[key];
  if (!t) return "text-muted-foreground";
  if (value <= t.good) return "text-emerald-400";
  if (value <= t.needsImprovement) return "text-amber-400";
  return "text-red-400";
};

const formatValue = (key: string, value: number | null): string => {
  if (value === null) return "—";
  if (key === "CLS") return value.toFixed(2);
  return `${Math.round(value)}ms`;
};

export const WebVitalsCard = ({ data, source }: { data: WebVitalsMetrics; source: SourceStatus }) => {
  const rows = [
    { key: "LCP", value: data.lcpP75 },
    { key: "INP", value: data.inpP75 },
    { key: "CLS", value: data.clsP75 },
    { key: "FCP", value: data.fcpP75 },
    { key: "TTFB", value: data.ttfbP75 },
  ];
  return (
    <CardShell title="Web Vitals P75 (24h)" source={{ name: "Sentry", status: source }}>
      <ul className="grid grid-cols-5 gap-2 text-center">
        {rows.map((r) => (
          <li key={r.key}>
            <p className="text-[10px] uppercase text-muted-foreground">{r.key}</p>
            <p className={cn("mt-1 font-mono text-sm font-semibold tabular-nums", ratingColor(r.key, r.value))}>
              {formatValue(r.key, r.value)}
            </p>
          </li>
        ))}
      </ul>
    </CardShell>
  );
};
