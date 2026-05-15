import type { SourceStatus, UpstreamStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<UpstreamStatus["status"], string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  unknown: "bg-muted",
};

const STATUS_LABEL: Record<UpstreamStatus["status"], string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

export const UpstreamStatusCard = ({ data, source }: { data: UpstreamStatus[]; source: SourceStatus }) => (
  <CardShell title="上游 SaaS 状态" source={{ name: "Statuspage", status: source }}>
    <ul className="space-y-2.5">
      {data.map((p) => (
        <li key={p.name} className="flex items-center justify-between">
          <a href={p.url} target="_blank" rel="noopener" className="text-sm hover:underline">
            {p.name}
          </a>
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", STATUS_DOT[p.status])} />
            <span className="text-xs text-muted-foreground">{STATUS_LABEL[p.status]}</span>
          </div>
        </li>
      ))}
    </ul>
  </CardShell>
);
