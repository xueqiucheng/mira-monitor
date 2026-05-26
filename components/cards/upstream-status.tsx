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

const watchedTooltip = (watched?: string[]): string => {
  if (!watched || watched.length === 0) return "跟踪：所有子系统";
  return `跟踪：${watched.join("、")}`;
};

export const UpstreamStatusCard = ({
  data,
  source,
}: {
  data: UpstreamStatus[];
  source: SourceStatus;
}) => {
  if (data.length === 0) {
    return (
      <CardShell title="上游 SaaS 状态" source={{ name: "Statuspage", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="上游 SaaS 状态" source={{ name: "Statuspage", status: source }}>
      <ul className="space-y-2.5">
        {data.map((p) => {
          const affected = p.affectedComponents ?? [];
          return (
            <li key={p.name} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="text-sm hover:underline"
                  title={watchedTooltip(p.watchedComponents)}
                >
                  {p.name}
                </a>
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", STATUS_DOT[p.status])} />
                  <span className="text-xs text-muted-foreground">
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
              </div>
              {affected.length > 0 && (
                <div
                  className="pl-0.5 text-[11px] text-muted-foreground/70 truncate"
                  title={affected.map((c) => `${c.name} (${c.status})`).join("\n")}
                >
                  ↳ {affected.map((c) => c.name).join("、")}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
};
