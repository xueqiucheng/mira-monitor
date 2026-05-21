// Railway GraphQL 鉴权探针 — 验证 token 类型 + Railway API 当前的鉴权要求
//
// 跑法:
//   bun run test:railway
//
// 自动从项目根的 .env 读 RAILWAY_BILLING_TOKEN(Bun 原生支持),不用 export
//
// 探针对比 4 种 (header × query) 组合,确认 token 是 Project Token 还是 Account/Workspace Token:
//
//   ┌─────────────────────────┬──────────────────────────────────────┬─────────────────────┐
//   │ Header                  │ Query                                │ 预期成功的 token 类型 │
//   ├─────────────────────────┼──────────────────────────────────────┼─────────────────────┤
//   │ Project-Access-Token    │ { projectToken { projectId } }       │ Project Token       │
//   │ Project-Access-Token    │ { me { id } }                        │ (都失败,me 是账号级) │
//   │ Authorization: Bearer   │ { projectToken { projectId } }       │ (都失败,projectToken 仅 PT) │
//   │ Authorization: Bearer   │ { me { id } }                        │ Account/Workspace   │
//   └─────────────────────────┴──────────────────────────────────────┴─────────────────────┘
//
// 输出 4 个组合的 HTTP 状态 + 完整 JSON,帮你 1 眼定位 token 类型。

const RAILWAY_GRAPHQL = "https://backboard.railway.com/graphql/v2";

const HEADERS = {
  PROJECT: (token: string) => ({
    "Project-Access-Token": token,
    "Content-Type": "application/json",
  }),
  BEARER: (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }),
};

const QUERIES = {
  PROJECT_TOKEN: "{ projectToken { projectId } }",
  ME: "{ me { id name email } }",
};

interface Combo {
  label: string;
  headers: Record<string, string>;
  query: string;
}

const runProbe = async (combo: Combo): Promise<void> => {
  console.log(`\n=== ${combo.label} ===`);
  try {
    const res = await fetch(RAILWAY_GRAPHQL, {
      method: "POST",
      headers: combo.headers,
      body: JSON.stringify({ query: combo.query }),
    });
    const text = await res.text();
    console.log(`status: ${res.status}`);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  } catch (e) {
    console.log(`network error: ${e instanceof Error ? e.message : String(e)}`);
  }
};

const main = async (): Promise<void> => {
  const token = process.env.RAILWAY_BILLING_TOKEN ?? process.env.RAILWAY_TOKEN ?? process.env.RAILWAY_DATASOURCE_TOKEN;
  if (!token) {
    console.error("❌ Need one of: RAILWAY_BILLING_TOKEN / RAILWAY_TOKEN / RAILWAY_DATASOURCE_TOKEN");
    process.exit(1);
  }

  console.log(`Testing Railway GraphQL with token: ${token.slice(0, 8)}...${token.slice(-4)} (len=${token.length})`);

  const combos: Combo[] = [
    {
      label: "[1/4] Project-Access-Token  +  projectToken { projectId }   ← Project Token 预期成功",
      headers: HEADERS.PROJECT(token),
      query: QUERIES.PROJECT_TOKEN,
    },
    {
      label: "[2/4] Project-Access-Token  +  me { id }                    ← 任何 token 都应失败(me 是账号级)",
      headers: HEADERS.PROJECT(token),
      query: QUERIES.ME,
    },
    {
      label: "[3/4] Authorization Bearer  +  projectToken { projectId }   ← 任何 token 都应失败(projectToken 仅 Project header)",
      headers: HEADERS.BEARER(token),
      query: QUERIES.PROJECT_TOKEN,
    },
    {
      label: "[4/4] Authorization Bearer  +  me { id }                    ← Account/Workspace Token 预期成功",
      headers: HEADERS.BEARER(token),
      query: QUERIES.ME,
    },
  ];

  for (const c of combos) {
    await runProbe(c);
  }

  console.log("\n────────────────────────────────────────────────────────");
  console.log("诊断:");
  console.log("  - 只有 [1/4] 成功 → Project Token,fetchRailwayDaily 会用 Project-Access-Token 头 + 传 projectId");
  console.log("  - 只有 [4/4] 成功 → Account/Workspace Token,fetchRailwayDaily 会用 Bearer 头 + 不传 projectId");
  console.log("  - 都不成功      → token 失效或没有 billing scope,需要去 Railway dashboard 重发");
};

main().catch((e) => {
  console.error("test-railway failed:", e);
  process.exit(1);
});
