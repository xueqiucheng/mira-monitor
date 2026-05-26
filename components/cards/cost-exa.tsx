import type { ExaCost, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd, formatNumber } from "@/lib/format";

export const ExaCostCard = ({ data, source }: { data: ExaCost | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="Exa (今日)" source={{ name: "Ingest", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  const max = Math.max(...data.items.map((i) => i.cost_usd), 0.01);
  return (
    <CardShell title="Exa (今日)" source={{ name: "Ingest", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatCostUsd(data.total_cost_usd)}</p>
        <p className="text-xs text-muted-foreground">today</p>
      </div>
      <ul className="mt-3 space-y-2">
        {data.items.map((it) => {
          const pct = (it.cost_usd / max) * 100;
          return (
            <li key={it.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{it.name}</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(it.request_count)} · {formatCostUsd(it.cost_usd, 3)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: "hsl(142 76% 50%)" }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
};
