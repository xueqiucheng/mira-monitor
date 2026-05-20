import type { ApolloCost, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd, formatNumber } from "@/lib/format";

export const ApolloCostCard = ({ data, source }: { data: ApolloCost; source: SourceStatus }) => (
  <CardShell title="Apollo (今日)" source={{ name: "Ingest", status: source }}>
    <div className="flex items-baseline justify-between">
      <p className="text-3xl font-semibold tabular-nums">
        <span className="mr-2 text-base font-normal text-muted-foreground">预估</span>
        {formatCostUsd(data.estimated_cost_usd)}
      </p>
      <p className="text-xs text-muted-foreground">$0.5 / call</p>
    </div>
    <ul className="mt-3 space-y-1.5">
      {data.endpoints.map((e) => (
        <li key={e.endpoint} className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-mono" title={e.endpoint}>
            {e.endpoint}
          </span>
          <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
            {formatNumber(e.request_count)} 次
          </span>
        </li>
      ))}
    </ul>
  </CardShell>
);
