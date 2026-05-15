import type { PingResult, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PingAvailabilityCard = ({ data, source }: { data: PingResult; source: SourceStatus }) => {
  const up = data.status === "up";
  return (
    <CardShell title="健康检查" source={{ name: "ping", status: source }}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", up ? "bg-emerald-500" : "bg-red-500")} />
            <span className="text-2xl font-semibold">{up ? "UP" : "DOWN"}</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={data.url}>
            {data.url}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl tabular-nums">{formatMs(data.latencyMs)}</div>
          <p className="text-xs text-muted-foreground">latency</p>
        </div>
      </div>
    </CardShell>
  );
};
