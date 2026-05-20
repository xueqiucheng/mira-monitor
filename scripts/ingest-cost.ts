// 本地/CLI 触发 cost ingest
// 跑法:
//   bun run scripts/ingest-cost.ts               # 跑今日(北京时间)
//   bun run scripts/ingest-cost.ts 2026-05-19    # 回填指定日期
//
// 生产环境的定时触发不走这里,由 Railway sibling cron service hit
// POST /api/ingest/cost endpoint(见 README "Cost ingest 部署"一节)

import { runDailyCostIngest } from "../lib/cost/ingest";

const main = async (): Promise<void> => {
  const dateArg = process.argv[2];
  const report = await runDailyCostIngest(dateArg);
  console.log(JSON.stringify(report, null, 2));
  const allOk =
    report.ai_gateway.ok && report.exa.ok && report.railway.ok && report.apollo.ok;
  process.exit(allOk ? 0 : 1);
};

main().catch((e) => {
  console.error("ingest-cost failed:", e);
  process.exit(2);
});
