import type { CrashFreeMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatNumber, formatPercent } from "@/lib/format";

export const CrashFreeCard = ({ data, source }: { data: CrashFreeMetrics | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="Crash-free Sessions (24h)" source={{ name: "Sentry", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="Crash-free Sessions (24h)" source={{ name: "Sentry", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatPercent(data.rate, 2)}</p>
        <p className="text-xs text-muted-foreground">{formatNumber(data.totalSessions, { compact: true })} sessions</p>
      </div>
    </CardShell>
  );
};
