import type { CostTabData, SourceStatus } from "@/lib/types";
import { AIGatewayCostCard } from "@/components/cards/cost-ai-gateway";
import { ApolloCostCard } from "@/components/cards/cost-apollo";
import { CostTrendCard } from "@/components/cards/cost-trend";
import { ExaCostCard } from "@/components/cards/cost-exa";
import { RailwayCostCard } from "@/components/cards/cost-railway";

const ingestSource: SourceStatus = { ok: false, configured: true, message: "mock" };

export const CostTab = ({ data }: { data: CostTabData }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    <AIGatewayCostCard data={data.ai_gateway} source={ingestSource} />
    <ExaCostCard data={data.exa} source={ingestSource} />
    <RailwayCostCard data={data.railway} source={ingestSource} />
    <ApolloCostCard data={data.apollo} source={ingestSource} />
    <CostTrendCard data={data} source={ingestSource} className="md:col-span-2" />
  </div>
);
