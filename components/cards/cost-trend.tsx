"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CostTabData, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatCostUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLORS = {
  ai_gateway: "hsl(217 91% 60%)",
  exa: "hsl(142 76% 50%)",
  railway: "hsl(280 70% 60%)",
  apollo: "hsl(40 96% 60%)",
};

interface ChartRow {
  date: string;
  AI: number;
  Exa: number;
  Railway: number;
  Apollo: number;
}

export const CostTrendCard = ({
  data,
  source,
  className,
}: {
  data: CostTabData;
  source: SourceStatus;
  className?: string;
}) => {
  const chartData: ChartRow[] = data.trend30d.map((d) => ({
    date: d.date.slice(5),
    AI: d.ai_gateway,
    Exa: d.exa,
    Railway: d.railway,
    Apollo: d.apollo,
  }));
  const total30d = data.trend30d.reduce(
    (s, d) => s + d.ai_gateway + d.exa + d.railway + d.apollo,
    0,
  );
  return (
    <CardShell title="30 天总成本趋势" source={{ name: "Ingest", status: source }} className={cn("overflow-visible", className)}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{formatCostUsd(total30d)}</p>
        <p className="text-xs text-muted-foreground">30d sum (stacked)</p>
      </div>
      <div className="-mx-2 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(0 0% 18%)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(0 0% 55%)", fontSize: 10 }}
              axisLine={{ stroke: "hsl(0 0% 18%)" }}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fill: "hsl(0 0% 55%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(0 0% 8%)",
                border: "1px solid hsl(0 0% 18%)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(0 0% 80%)" }}
              formatter={(value, name) => [formatCostUsd(Number(value)), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconSize={10} />
            <Area type="monotone" dataKey="AI" stackId="1" stroke={COLORS.ai_gateway} fill={COLORS.ai_gateway} fillOpacity={0.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="Apollo" stackId="1" stroke={COLORS.apollo} fill={COLORS.apollo} fillOpacity={0.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="Exa" stackId="1" stroke={COLORS.exa} fill={COLORS.exa} fillOpacity={0.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="Railway" stackId="1" stroke={COLORS.railway} fill={COLORS.railway} fillOpacity={0.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
};
