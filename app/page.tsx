"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMetrics } from "@/hooks/use-metrics";
import { HealthTab } from "@/components/tabs/health-tab";
import { BusinessTab } from "@/components/tabs/business-tab";
import { CostTab } from "@/components/tabs/cost-tab";

const formatRelative = (ts: string): string => {
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
};

const Page = () => {
  const { data, error, isFetching } = useMetrics();
  const [lastUpdate, setLastUpdate] = useState<string>("loading…");

  useEffect(() => {
    if (!data?.generatedAt) return;
    const update = () => setLastUpdate(formatRelative(data.generatedAt));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [data?.generatedAt]);

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mira Monitor</h1>
          <p className="text-xs text-muted-foreground">Mira 海外版 · 全局监控大屏</p>
        </div>
        <div className="font-mono text-xs text-muted-foreground tabular-nums">
          {error ? (
            <span className="text-destructive">fetch error</span>
          ) : (
            <span>
              {lastUpdate}
              {isFetching ? " · ↻" : ""}
            </span>
          )}
        </div>
      </header>
      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">基础服务健康度</TabsTrigger>
          <TabsTrigger value="business">业务看板</TabsTrigger>
          <TabsTrigger value="cost">费用监控</TabsTrigger>
        </TabsList>
        <TabsContent value="health" className="mt-6">
          {data ? (
            <HealthTab data={data.health} sources={data.sources} />
          ) : (
            <div className="text-sm text-muted-foreground">loading…</div>
          )}
        </TabsContent>
        <TabsContent value="business" className="mt-6">
          {data ? (
            <BusinessTab data={data.business} sources={data.sources} />
          ) : (
            <div className="text-sm text-muted-foreground">loading…</div>
          )}
        </TabsContent>
        <TabsContent value="cost" className="mt-6">
          {data ? (
            <CostTab data={data.cost} />
          ) : (
            <div className="text-sm text-muted-foreground">loading…</div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
};

export default Page;
