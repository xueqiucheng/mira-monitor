import type { SandboxMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/format";

export const SandboxCard = ({ data, source }: { data: SandboxMetrics | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="沙箱执行 (24h)" source={{ name: "Sentry", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  const rateColor =
    data.errorRate < 0.01 ? "text-emerald-400" : data.errorRate < 0.05 ? "text-amber-400" : "text-red-400";
  return (
    <CardShell title="沙箱执行 (24h)" source={{ name: "Sentry", status: source }}>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Runs</p>
          <p className="font-mono text-xl tabular-nums">{formatNumber(data.totalRuns, { compact: true })}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Errors</p>
          <p className="font-mono text-xl tabular-nums">{formatNumber(data.errorCount)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Rate</p>
          <p className={cn("font-mono text-xl tabular-nums", rateColor)}>{formatPercent(data.errorRate, 2)}</p>
        </div>
      </div>
    </CardShell>
  );
};
