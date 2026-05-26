import type { FunnelStep, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatNumber, formatPercent } from "@/lib/format";

export const ActivationFunnelCard = ({ data, source }: { data: FunnelStep[]; source: SourceStatus }) => {
  if (data.length === 0) {
    return (
      <CardShell title="激活漏斗" source={{ name: "PostHog", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  const top = data[0]?.count ?? 0;
  return (
    <CardShell title="激活漏斗" source={{ name: "PostHog", status: source }}>
      <ul className="space-y-2">
        {data.map((step) => {
          const widthPct = top > 0 ? (step.count / top) * 100 : 0;
          return (
            <li key={step.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{step.name}</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(step.count)} · {formatPercent(step.conversionRate, 1)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
};
