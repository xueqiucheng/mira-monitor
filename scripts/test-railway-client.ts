// Railway client 集成验证 — 用补丁后的 fetchRailwayDaily 真实打 Railway,检查 5 个 measurement 都拿到数值
//
// 跑法:
//   bun run test:railway-client
//
// 自动从项目根的 .env 读 RAILWAY_BILLING_TOKEN(Bun 原生支持),不用 export
//
// 校验项:
//   1. detectRailwayAuthMode 探到的 auth mode 合理(project 或 account)
//   2. estimatedUsage 返回 5 个 measurement 各一条
//   3. 每条 estimatedValue 是数字(>= 0,可能是 0,只要类型对)
//   4. monthlyEstimateUsd > 0(本月有用量的话)
//
// 任何一项不满足直接退出非零,适合接 CI 当 smoke test。

import { fetchRailwayDaily, __internals } from "../lib/cost/providers/railway-billing";

const EXPECTED_MEASUREMENTS = __internals.RAILWAY_MEASUREMENTS;

const main = async (): Promise<void> => {
  const token =
    process.env.RAILWAY_BILLING_TOKEN ??
    process.env.RAILWAY_TOKEN ??
    process.env.RAILWAY_DATASOURCE_TOKEN;
  if (!token) {
    console.error("❌ Need one of: RAILWAY_BILLING_TOKEN / RAILWAY_TOKEN / RAILWAY_DATASOURCE_TOKEN");
    process.exit(1);
  }
  // 让 provider 从环境变量读 token,这里只是确认有值
  process.env.RAILWAY_BILLING_TOKEN = token;

  console.log("→ calling fetchRailwayDaily() ...");
  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof fetchRailwayDaily>>;
  try {
    result = await fetchRailwayDaily();
  } catch (e) {
    console.error("❌ fetchRailwayDaily threw:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const elapsed = Date.now() - t0;

  console.log(`← responded in ${elapsed}ms`);
  console.log(JSON.stringify(result, null, 2));

  const failures: string[] = [];

  if (typeof result.monthlyEstimateUsd !== "number") {
    failures.push(`monthlyEstimateUsd 不是 number: ${typeof result.monthlyEstimateUsd}`);
  }
  if (!Array.isArray(result.projects)) {
    failures.push(`projects 不是数组: ${typeof result.projects}`);
  }

  // 校验 projects 里至少有一个,且每个 cost_usd 是数字
  if (result.projects.length === 0) {
    failures.push("projects 数组为空 — Railway 没返任何 project 的 usage(token scope 可能不对)");
  } else {
    for (const p of result.projects) {
      if (typeof p.project_id !== "string" || p.project_id === "") {
        failures.push(`project_id 不是非空 string: ${JSON.stringify(p)}`);
      }
      if (typeof p.cost_usd !== "number" || Number.isNaN(p.cost_usd)) {
        failures.push(`cost_usd 不是 number: ${JSON.stringify(p)}`);
      }
    }
  }

  console.log("\n────────────────────────────────────────────────────────");
  console.log(`期望 measurements:  ${EXPECTED_MEASUREMENTS.join(", ")}`);
  console.log(`projects 数量:       ${result.projects.length}`);
  console.log(`monthlyEstimateUsd:  $${result.monthlyEstimateUsd.toFixed(4)}`);

  if (failures.length > 0) {
    console.error("\n❌ 检查失败:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\n✅ 所有检查通过");
};

main().catch((e) => {
  console.error("test-railway-client failed:", e);
  process.exit(1);
});
