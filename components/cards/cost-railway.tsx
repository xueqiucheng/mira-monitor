import type { RailwayCost, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd } from "@/lib/format";

const TOP_N = 5;

const shortId = (id: string): string => id.slice(0, 8);

export const RailwayCostCard = ({ data, source }: { data: RailwayCost; source: SourceStatus }) => {
  const topProjects = (data.projects ?? []).slice(0, TOP_N);
  const dayOfMonth = new Date().getUTCDate(); // 北京时差 ≤ 1 天,这里日均估算粒度无所谓
  const dailyAvg = data.monthly_estimate_usd / Math.max(dayOfMonth, 1);

  return (
    <CardShell title="Railway (月预估)" source={{ name: "Ingest", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatCostUsd(data.monthly_estimate_usd)}</p>
        <p className="text-xs text-muted-foreground">month-to-date</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">日均 ~{formatCostUsd(dailyAvg)}</p>

      {topProjects.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] uppercase text-muted-foreground">TOP {Math.min(TOP_N, topProjects.length)} 项目</p>
          {topProjects.map((p) => (
            <div key={p.project_id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-mono" title={p.project_id}>
                {p.name ?? shortId(p.project_id)}
              </span>
              <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
                {formatCostUsd(p.cost_usd)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </CardShell>
  );
};
