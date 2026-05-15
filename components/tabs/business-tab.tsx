import type { BusinessTabData, SourceName, SourceStatus } from "@/lib/types";
import { ActivationFunnelCard } from "@/components/cards/activation-funnel";
import { AvgTaskCostCard } from "@/components/cards/avg-task-cost";
import { DauMauCard } from "@/components/cards/dau-mau";
import { MessagesTrendCard } from "@/components/cards/messages-trend";
import { NewUsersCard } from "@/components/cards/new-users";
import { RetentionCard } from "@/components/cards/retention";
import { TasksTrendCard } from "@/components/cards/tasks-trend";
import { TokenCostByModelCard } from "@/components/cards/token-cost-by-model";
import { ToolCallDistributionCard } from "@/components/cards/tool-call-distribution";

interface BusinessTabProps {
  data: BusinessTabData;
  sources: Record<SourceName, SourceStatus>;
}

export const BusinessTab = ({ data, sources }: BusinessTabProps) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    <DauMauCard data={data.growth} source={sources.posthog} />
    <NewUsersCard data={data.growth} source={sources.posthog} />
    <ActivationFunnelCard data={data.activationFunnel} source={sources.posthog} />
    <RetentionCard data={data.retention} source={sources.posthog} />
    <TasksTrendCard data={data.usage} source={sources.posthog} />
    <MessagesTrendCard data={data.usage} source={sources.posthog} />
    <TokenCostByModelCard data={data.llm} source={sources.langfuse} />
    <ToolCallDistributionCard data={data.llm} source={sources.langfuse} />
    <AvgTaskCostCard data={data.llm} source={sources.langfuse} />
  </div>
);
