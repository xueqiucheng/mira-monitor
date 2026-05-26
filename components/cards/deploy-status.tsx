import type { DeployStatus, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatRelativeTime, shortSha } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<DeployStatus["status"], string> = {
  SUCCESS: "text-emerald-400 bg-emerald-500/10",
  FAILED: "text-red-400 bg-red-500/10",
  CRASHED: "text-red-400 bg-red-500/10",
  BUILDING: "text-amber-400 bg-amber-500/10",
  DEPLOYING: "text-amber-400 bg-amber-500/10",
  UNKNOWN: "text-muted-foreground bg-muted",
};

export const DeployStatusCard = ({ data, source }: { data: DeployStatus[]; source: SourceStatus }) => (
  <CardShell title="部署状态" source={{ name: "Railway", status: source }}>
    {data.length === 0 ? (
      <p className="text-sm text-muted-foreground">—</p>
    ) : (
      <ul className="space-y-3">
        {data.map((d) => (
          <li key={d.service} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{d.service}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_PILL[d.status])}>
                {d.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate font-mono">{shortSha(d.commitSha)}</span>
              <span>{formatRelativeTime(d.deployedAt)}</span>
            </div>
            {d.commitMessage ? (
              <p className="truncate text-xs text-muted-foreground/80" title={d.commitMessage}>
                {d.commitMessage}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    )}
  </CardShell>
);
