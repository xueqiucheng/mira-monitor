import type { GrowthMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { Spark } from "./spark";
import { formatNumber } from "@/lib/format";

export const DauMauCard = ({ data, source }: { data: GrowthMetrics | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="DAU / MAU (30d)" source={{ name: "PostHog", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  const dauToday = data.dau.at(-1)?.value ?? 0;
  return (
    <CardShell title="DAU / MAU (30d)" source={{ name: "PostHog", status: source }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">DAU</p>
          <p className="text-3xl font-semibold tabular-nums">{formatNumber(dauToday)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-muted-foreground">MAU</p>
          <p className="text-xl font-semibold tabular-nums">{formatNumber(data.mauCurrent, { compact: true })}</p>
        </div>
      </div>
      <div className="mt-2">
        <Spark data={data.dau} color="hsl(217 91% 60%)" />
      </div>
    </CardShell>
  );
};
