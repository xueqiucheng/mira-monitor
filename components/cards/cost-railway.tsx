import type { RailwayCost, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd } from "@/lib/format";

export const RailwayCostCard = ({ data, source }: { data: RailwayCost; source: SourceStatus }) => (
  <CardShell title="Railway (月预估)" source={{ name: "Ingest", status: source }}>
    <div className="flex items-baseline justify-between">
      <p className="text-3xl font-semibold tabular-nums">{formatCostUsd(data.monthly_estimate_usd)}</p>
      <p className="text-xs text-muted-foreground">month-to-date</p>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">基础设施月度累计,日均 ~${(data.monthly_estimate_usd / 30).toFixed(2)}</p>
  </CardShell>
);
