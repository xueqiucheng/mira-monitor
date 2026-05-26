import type { CostTabData, SourceName, SourceStatus } from "@/lib/types";
import { AIGatewayCostCard } from "@/components/cards/cost-ai-gateway";
import { ApolloCostCard } from "@/components/cards/cost-apollo";
import { CostTrendCard } from "@/components/cards/cost-trend";
import { ExaCostCard } from "@/components/cards/cost-exa";
import { RailwayCostCard } from "@/components/cards/cost-railway";

interface CostTabProps {
  data: CostTabData;
  sources?: Record<SourceName, SourceStatus>;
}

export const CostTab = ({ data, sources }: CostTabProps) => {
  const costSource = sources?.cost ?? { ok: false, configured: false };
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <AIGatewayCostCard data={data.ai_gateway} source={costSource} />
      <ExaCostCard data={data.exa} source={costSource} />
      <RailwayCostCard data={data.railway} source={costSource} />
      <ApolloCostCard data={data.apollo} source={costSource} />
      <CostTrendCard data={data} source={costSource} className="md:col-span-2" />
    </div>
  );
};
