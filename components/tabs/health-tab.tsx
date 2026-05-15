import type { HealthTabData, SourceName, SourceStatus } from "@/lib/types";
import { ApiSlaCard } from "@/components/cards/api-sla";
import { CrashFreeCard } from "@/components/cards/crash-free";
import { DeployStatusCard } from "@/components/cards/deploy-status";
import { LlmProvidersCard } from "@/components/cards/llm-providers";
import { PingAvailabilityCard } from "@/components/cards/ping-availability";
import { SandboxCard } from "@/components/cards/sandbox";
import { UpstreamStatusCard } from "@/components/cards/upstream-status";
import { WebVitalsCard } from "@/components/cards/web-vitals";

interface HealthTabProps {
  data: HealthTabData;
  sources: Record<SourceName, SourceStatus>;
}

export const HealthTab = ({ data, sources }: HealthTabProps) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    <UpstreamStatusCard data={data.upstream} source={sources.statuspage} />
    <DeployStatusCard data={data.deploy} source={sources.railway} />
    <PingAvailabilityCard data={data.ping} source={sources.ping} />
    <ApiSlaCard data={data.apiSla} source={sources.sentry} />
    <WebVitalsCard data={data.webVitals} source={sources.sentry} />
    <CrashFreeCard data={data.crashFree} source={sources.sentry} />
    <LlmProvidersCard data={data.llmProviders} source={sources.langfuse} />
    <SandboxCard data={data.sandbox} source={sources.sentry} />
  </div>
);
