import type { AIGatewayCost, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd, formatNumber } from "@/lib/format";

const formatTokens = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};

export const AIGatewayCostCard = ({ data, source }: { data: AIGatewayCost | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="AI Gateway (今日)" source={{ name: "Ingest", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="AI Gateway (今日)" source={{ name: "Ingest", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatCostUsd(data.total_cost_usd)}</p>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            余额 <span className="font-mono tabular-nums">{formatCostUsd(data.balance_usd)}</span>
          </p>
          <p>
            <span className="font-mono tabular-nums">{formatNumber(data.request_count)}</span> reqs
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-center">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">In</p>
          <p className="font-mono text-xs tabular-nums">{formatTokens(data.tokens.input)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Out</p>
          <p className="font-mono text-xs tabular-nums">{formatTokens(data.tokens.output)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">CacheR</p>
          <p className="font-mono text-xs tabular-nums">{formatTokens(data.tokens.cache_read)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">CacheW</p>
          <p className="font-mono text-xs tabular-nums">{formatTokens(data.tokens.cache_write)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] uppercase text-muted-foreground">Top 模型</p>
        {data.top_models.map((m) => (
          <div key={m.model} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-mono" title={m.model}>
              {m.model}
            </span>
            <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
              {formatCostUsd(m.cost_usd)} · {formatNumber(m.request_count)}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  );
};
