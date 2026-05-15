"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { TimeSeriesPoint } from "@/lib/types";

export const Spark = ({ data, color = "hsl(217 91% 60%)" }: { data: TimeSeriesPoint[]; color?: string }) => (
  <ResponsiveContainer width="100%" height={48}>
    <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        fill={color}
        fillOpacity={0.15}
        isAnimationActive={false}
      />
    </AreaChart>
  </ResponsiveContainer>
);
