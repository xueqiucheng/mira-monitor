import type { GrowthMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { Spark } from "./spark";
import { formatNumber } from "@/lib/format";

export const NewUsersCard = ({ data, source }: { data: GrowthMetrics; source: SourceStatus }) => (
  <CardShell title="新增用户 (30d)" source={{ name: "PostHog", status: source }}>
    <div className="flex items-baseline justify-between">
      <p className="text-3xl font-semibold tabular-nums">{formatNumber(data.newUsersToday)}</p>
      <p className="text-xs text-muted-foreground">today</p>
    </div>
    <div className="mt-2">
      <Spark data={data.newUsersTrend} color="hsl(142 76% 50%)" />
    </div>
  </CardShell>
);
