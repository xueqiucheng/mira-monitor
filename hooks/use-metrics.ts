"use client";

import { useQuery } from "@tanstack/react-query";
import type { MetricsResponse } from "@/lib/types";

export const useMetrics = () =>
  useQuery<MetricsResponse>({
    queryKey: ["metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error(`metrics ${res.status}`);
      return (await res.json()) as MetricsResponse;
    },
  });
