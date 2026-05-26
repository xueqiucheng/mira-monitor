import type { SourceStatus, UsageMetrics } from "@/lib/types";
import { CardShell } from "./card-shell";
import { Spark } from "./spark";
import { formatNumber } from "@/lib/format";

export const MessagesTrendCard = ({ data, source }: { data: UsageMetrics | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="消息发送 (30d)" source={{ name: "PostHog", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="消息发送 (30d)" source={{ name: "PostHog", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatNumber(data.messagesToday, { compact: true })}</p>
        <p className="text-xs text-muted-foreground">today</p>
      </div>
      <div className="mt-2">
        <Spark data={data.messagesTrend} color="hsl(199 89% 60%)" />
      </div>
    </CardShell>
  );
};
