import type { ApiSlaMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { Spark } from "./spark";
import { formatMs, formatPercent } from "@/lib/format";

export const ApiSlaCard = ({ data, source }: { data: ApiSlaMetrics | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="API SLA (24h)" source={{ name: "Sentry", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="API SLA (24h)" source={{ name: "Sentry", status: source }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Error 24h</p>
          <p className="text-2xl font-semibold tabular-nums">{formatPercent(data.errorRate24h, 2)}</p>
          <p className="text-[10px] text-muted-foreground">1h: {formatPercent(data.errorRate1h, 2)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">P95 / P99</p>
          <p className="text-2xl font-semibold tabular-nums">{formatMs(data.p95LatencyMs)}</p>
          <p className="text-[10px] text-muted-foreground">P99: {formatMs(data.p99LatencyMs)}</p>
        </div>
      </div>
      <div className="mt-3">
        <Spark data={data.trend} color="hsl(0 84% 60%)" />
      </div>
      {data.samplingNote ? <p className="mt-1 text-[10px] text-muted-foreground">注:{data.samplingNote}</p> : null}
    </CardShell>
  );
};
