import type { ApolloCost, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd, formatNumber } from "@/lib/format";

// Apollo 的 day 桶是滚动 24 小时,不是日历日,所以这个卡片的数字会一天内上下浮动
// (新调用进入窗口推高 / 老调用滚出窗口压低)。Apollo API 不返时间戳,我们无法
// 反推真正的"日历日"消耗,所以诚实标注为"近 24h"。
export const ApolloCostCard = ({ data, source }: { data: ApolloCost | null; source: SourceStatus }) => {
  if (!data) {
    return (
      <CardShell title="Apollo (近 24h)" source={{ name: "Ingest", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="Apollo (近 24h)" source={{ name: "Ingest", status: source }}>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">
          <span className="mr-2 text-base font-normal text-muted-foreground">预估</span>
          {formatCostUsd(data.estimated_cost_usd)}
        </p>
        <p className="text-xs text-muted-foreground">$0.5 / call · 滚动</p>
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
      <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
        ⓘ Apollo 的 day 桶是滚动 24h(不是日历日),数字会随窗口推移浮动
      </p>
    </CardShell>
  );
};
