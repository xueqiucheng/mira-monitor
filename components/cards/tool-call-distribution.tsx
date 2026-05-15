import type { LlmMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatNumber } from "@/lib/format";

export const ToolCallDistributionCard = ({ data, source }: { data: LlmMetrics; source: SourceStatus }) => {
  const sorted = [...data.topTools].sort((a, b) => b.count - a.count).slice(0, 8);
  const max = Math.max(...sorted.map((t) => t.count), 1);
  return (
    <CardShell title="工具调用 Top 8 (24h)" source={{ name: "Langfuse", status: source }}>
      <ul className="space-y-1.5">
        {sorted.map((t) => {
          const pct = (t.count / max) * 100;
          return (
            <li key={t.tool} className="flex items-center gap-2">
              <span className="w-32 truncate font-mono text-xs" title={t.tool}>
                {t.tool}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-12 text-right font-mono text-xs tabular-nums">{formatNumber(t.count)}</span>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
};
