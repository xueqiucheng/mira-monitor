import type { LlmMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd } from "@/lib/format";

export const AvgTaskCostCard = ({ data, source }: { data: LlmMetrics | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="平均任务成本 (24h)" source={{ name: "Langfuse", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="平均任务成本 (24h)" source={{ name: "Langfuse", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatCostUsd(data.avgCostPerTask, 3)}</p>
        <p className="text-xs text-muted-foreground">per task</p>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        total{" "}
        <span className="font-mono tabular-nums text-foreground">{formatCostUsd(data.totalCost24h)}</span> across all
        models
      </div>
    </CardShell>
  );
};
