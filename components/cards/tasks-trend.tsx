import type { SourceStatus, UsageMetrics } from "@/lib/types";
import { CardShell } from "./card-shell";
import { Spark } from "./spark";
import { formatNumber } from "@/lib/format";

export const TasksTrendCard = ({ data, source }: { data: UsageMetrics; source: SourceStatus }) => (
  <CardShell title="任务创建 (30d)" source={{ name: "PostHog", status: source }}>
    <div className="flex items-baseline justify-between">
      <p className="text-3xl font-semibold tabular-nums">{formatNumber(data.tasksToday)}</p>
      <p className="text-xs text-muted-foreground">today</p>
    </div>
    <div className="mt-2">
      <Spark data={data.tasksTrend} color="hsl(280 70% 60%)" />
    </div>
  </CardShell>
);
