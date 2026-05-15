import type { LlmMetrics, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd, formatNumber } from "@/lib/format";

const COLORS = ["hsl(217 91% 60%)", "hsl(280 70% 60%)", "hsl(142 76% 50%)", "hsl(40 96% 60%)", "hsl(0 84% 60%)"];

export const TokenCostByModelCard = ({ data, source }: { data: LlmMetrics; source: SourceStatus }) => {
  const max = Math.max(...data.byModel.map((m) => m.totalCost), 1);
  return (
    <CardShell title="Token & 成本 by Model (24h)" source={{ name: "Langfuse", status: source }}>
      <ul className="space-y-2">
        {data.byModel.map((m, i) => {
          const pct = (m.totalCost / max) * 100;
          return (
            <li key={m.model}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate font-mono" title={m.model}>
                  {m.model}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatNumber(m.totalTokens, { compact: true })} · {formatCostUsd(m.totalCost)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t pt-3 text-xs">
        <span className="text-muted-foreground">total</span>
        <span className="font-mono tabular-nums">
          {formatCostUsd(data.totalCost24h)} · {formatNumber(data.totalTokens24h, { compact: true })} tokens
        </span>
      </div>
    </CardShell>
  );
};
