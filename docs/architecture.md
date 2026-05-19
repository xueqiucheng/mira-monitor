# Mira Monitor 架构

Mira 海外版的全局监控大屏。

**v1 当前状态(本文 1-10 节)**:2 tab(基础服务健康度 / 业务看板)、17 卡片,统一在 `/api/metrics` 一个端点聚合 6 个数据源 → 前端 10s 轮询渲染。**无状态、不落地。**

**v2 规划中(本文第 11 节)**:加 SQLite 持久化 + 接收外部推送的成本数据(`POST /api/ingest/cost`)+ 加 Cost Tab(费用趋势)+ 加告警引擎(规则评估 + 推 webhook 给现有飞书/告警系统)。

## 1. 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | server route 用来代理含 secret 的 API 调用 |
| Runtime | Bun (Next.js 跑在 Node.js 兼容模式) | 包管理用 npm + npmmirror(bun resolver 在该用户网络下不稳) |
| 样式 | Tailwind v4(OKLCH 色域)+ shadcn/ui(base-nova / neutral) | 组件用 shadcn 原语 + Recharts |
| 图表 | Recharts(via shadcn/ui chart) | sparkline 用 `<AreaChart>` |
| 客户端数据 | TanStack Query v5 + `refetchInterval: 10s` | 全局 QueryClient,持久化关闭 |
| 类型 | TypeScript strict | 全部类型签名,零 `any` |

## 2. 目录结构

```
mira-monitor/
├── app/
│   ├── api/
│   │   ├── metrics/route.ts         聚合 endpoint(无 auth)
│   │   └── health/route.ts          dashboard 自身健康检查
│   ├── layout.tsx                   QueryProvider + 暗色 + Geist 字体
│   └── page.tsx                     Tabs 容器 + useMetrics + 顶部 lastUpdate
│
├── lib/
│   ├── env.ts                       env 读取 + isConfigured(source) 判断
│   ├── types.ts                     全部 metrics 数据结构(MetricsResponse 等)
│   ├── format.ts                    数字/百分比/毫秒/相对时间格式化
│   ├── fetch.ts                     通用 fetchJson(带超时,目前未广泛使用)
│   ├── utils.ts                     shadcn cn() helper
│   └── sources/
│       ├── index.ts                 聚合器:并行调 6 个 source,合并入 baseline
│       ├── mock.ts                  全量 mock data(baseline + 各 source 失败 fallback)
│       ├── ping.ts                  /api/health 心跳(无认证)
│       ├── statuspage.ts            6 家 SaaS 状态(无认证,RSS-style JSON)
│       ├── railway.ts               GraphQL deployments(Project-Access-Token header)
│       ├── posthog.ts               HogQL 自定义 SQL(Bearer phx_ key)
│       ├── langfuse.ts              metrics/daily + observations(Basic auth)
│       └── sentry.ts                events-stats + events + sessions(Bearer sntryu_)
│
├── components/
│   ├── providers/query-provider.tsx QueryClient 单例
│   ├── tabs/
│   │   ├── health-tab.tsx           8 卡片 grid
│   │   └── business-tab.tsx         9 卡片 grid
│   ├── cards/                       17 卡片组件 + card-shell + spark
│   └── ui/                          shadcn 原语(card / tabs / badge / chart / ...)
│
├── hooks/
│   └── use-metrics.ts               useQuery({ queryKey: ["metrics"] })
│
├── docs/
│   ├── architecture.md              本文件
│   └── dashboard-data-spec.md       每卡片对应 query 的 spec(实施前 spec)
│
├── .env.local                       实际 secret 值(不入仓)
├── .env.example                     env 字段说明
├── bunfig.toml                      npmmirror registry
├── next.config.ts                   Next 16 默认
└── package.json
```

## 3. 数据流总览

```
                            ┌──────────────────────────────────────────┐
                            │  外部数据源(都是云服务,需 secret 才能读) │
                            ├──────────────────────────────────────────┤
   ┌─ Sentry SaaS ──────────┤  events-stats / events / sessions API    │
   │  (sntryu_ token)        │                                          │
   │                         │                                          │
   ├─ Langfuse Cloud ────────┤  /api/public/metrics/daily               │
   │  (Basic pub:sec)        │  /api/public/observations?type=SPAN      │
   │                         │                                          │
   ├─ PostHog Cloud ─────────┤  /api/projects/@current/query/ (HogQL)   │
   │  (Bearer phx_)          │                                          │
   │                         │                                          │
   ├─ Railway GraphQL ───────┤  deployments(input: {project, env})      │
   │  (Project-Access-Token) │                                          │
   │                         │                                          │
   ├─ Statuspage.io × 6 ─────┤  Sentry/Vercel/CF/Anthropic/OpenAI/Railway
   │  (无 auth)               │   /api/v2/status.json                   │
   │                         │                                          │
   └─ Mira /api/health ──────┤  自建 HTTP ping(无 auth)                │
                            └──────────────────────────────────────────┘
                                          │
                                          │  HTTPS, 10s 超时, 1 次重试
                                          ▼
                            ┌──────────────────────────────────────────┐
                            │   lib/sources/<name>.ts(每源一个文件)   │
                            │                                          │
                            │   职责:                                  │
                            │   1) 读 env 拼 Auth header               │
                            │   2) 构 query/URL                        │
                            │   3) fetch(timeout, no-store)            │
                            │   4) 把 raw response → 标准 types        │
                            │   5) 失败 throw,让 aggregator 处理     │
                            └──────────────────────────────────────────┘
                                          │
                                          │  返回 typed metric 片段
                                          ▼
                            ┌──────────────────────────────────────────┐
                            │   lib/sources/index.ts(aggregator)      │
                            │                                          │
                            │   1) baseline = mockResponse()           │
                            │   2) Promise.all([settled(...) × 9])    │
                            │   3) 每源:configured? → 真调:返 null │
                            │   4) 成功 → 覆盖 baseline 对应字段      │
                            │   5) 失败 → 保留 mock + 写 sources.X.err │
                            │   6) 返回完整 MetricsResponse            │
                            └──────────────────────────────────────────┘
                                          │
                                          │  JSON
                                          ▼
                            ┌──────────────────────────────────────────┐
                            │   app/api/metrics/route.ts               │
                            │   GET handler · dynamic="force-dynamic"  │
                            │   Cache-Control: no-store                │
                            └──────────────────────────────────────────┘
                                          │
                                          │  fetch("/api/metrics")
                                          │  refetchInterval: 10s
                                          ▼
                            ┌──────────────────────────────────────────┐
                            │   app/page.tsx (client)                  │
                            │   useMetrics() → TanStack Query          │
                            │   ↓                                      │
                            │   ├─ HealthTab (8 cards)                 │
                            │   └─ BusinessTab (9 cards)               │
                            │                                          │
                            │   每卡片 = <CardShell title source>      │
                            │   source = sources[name] → badge color   │
                            └──────────────────────────────────────────┘
```

## 4. 各数据源处理细节

### 4.1 Sentry(`lib/sources/sentry.ts`)

**Auth**:`Authorization: Bearer sntryu_...`(User Auth Token,**不能**用 `sntrys_` Org Auth Token,后者只能上传 source map / 不能读 events)

**Region routing**:Mira 在 US 区,base URL 用 `https://us.sentry.io`,但 `projects/` 元数据查询用全局 `https://sentry.io`(region-agnostic)。

**Project slug → numeric ID 自动解析**:
- Sentry 的 `events-stats` / `events` / `sessions` 接受 `?project=<numeric_id>` 而非 slug,传 slug 报 `Invalid project parameter`
- 首次调用时 hit `/organizations/{org}/projects/` 列举 → 按 slug 匹配 → 缓存 ID 到 module-level `cachedProjectId`,后续请求复用

**3 个 fetch 并行**:
| Endpoint | 用途 | 字段 |
|---|---|---|
| `events-stats/?statsPeriod=24h&interval=1h&yAxis=count()&query=event.type:error` | 24h 错误数 trend(hourly buckets) | 24h trend + sum |
| `events/?statsPeriod=24h&dataset=transactions&field=count()&field=p95(...)&field=p99(...)` | 24h transaction 数 + 延迟 | tx count + p95 + p99 |
| `events/?statsPeriod=1h&dataset=transactions&field=count()` | 1h transaction 数(算 1h 错误率分母) | tx count |

**错误率算法**:
```
errorRate24h = errors_24h_sum / transactions_24h
errorRate1h = errors_1h_bucket / transactions_1h
```

**采样说明**:Mira prod 采样率 50%(`getSentrySampleRate()`),P95/P99 会有 sample bias,卡片显示 `注:Sentry 采样 50% · 高百分位有偏差`。

**Web Vitals**:同一个 `events/` 接口,`field=p75(measurements.{lcp,inp,cls,fcp,ttfb})`。**注意 Mira 当前 `browserTracingIntegration` 没开 `enableInp`**,INP 返 `null`。

**Crash-free**:`sessions/?field=crash_free_rate(session)&field=sum(session)&statsPeriod=24h`,数据在 `groups[0].totals`。

**重试**:`sentryFetch` 失败一次后重试一次(600ms 间隔),应对用户本地代理抖动。

---

### 4.2 Langfuse(`lib/sources/langfuse.ts`)

**Auth**:HTTP Basic `base64(publicKey:secretKey)`,host = `us.cloud.langfuse.com`(US 区,跟 Mira 的 LANGFUSE_BASEURL 一致)。

**Host 命名**:Mira 主仓 env 叫 `LANGFUSE_BASEURL`,本项目叫 `LANGFUSE_HOST`(同义,SDK 习惯命名)。

**两个端点**:

| Endpoint | 用途 | 数据形状 |
|---|---|---|
| `/api/public/metrics/daily?fromTimestamp=24h前` | 日聚合,服务端 group by model | `data[].usage[]` per-model {input/output/totalUsage, totalCost, countObservations, countTraces} |
| `/api/public/observations?type=SPAN&fromStartTime=2h前&limit=100&page=N` | 工具调用样本(name 形如 `ai.toolCall {tool}`) | `data[].name` 客户端 group by |

**为什么 daily 不查 24h 全量 observations**:
- Mira 24h 生成 16 万+ generations,客户端聚合不现实
- 但 daily metrics 已 server-side 算好 cost/tokens/model,完美匹配卡片所需
- SPAN 工具调用 daily endpoint 不暴露,只能拉 observations,所以**窗口缩到 2h + 分页 limit=100 × 2 页**,作为"近期工具活跃度样本"

**Cache 处理**:observations 响应大(每个含 input/output 全量上下文),单页 ~3MB > Next.js 2MB fetch cache 上限,所以**统一 `cache: "no-store"`,绕过 Next 缓存**。`metrics/daily` 也用 no-store(响应小,保持一致策略)。

**重试**:同 Sentry,失败 1 次重试 1 次。

**已知数据缺口**:
- Mira Langfuse trace 没标 `status=success/failed` → 任务成功率/LLM provider 错误率无法直接算,后两个卡片走 mock
- ~~部分模型名重复(`claude-sonnet-4-6` / `anthropic/claude-sonnet-4-6` / `anthropic/claude-sonnet-4.6`)未规整,后两个 cost 算 $0(Langfuse 价格表按 model id 精确匹配)~~ → 已在 `lib/sources/langfuse.ts` 加 `MODEL_ALIASES` 把变体合并到 canonical 名 + `FALLBACK_PRICES` 在 Langfuse 返 $0 时按 Anthropic 官方单价回算;**仍需主站统一命名才算彻底闭环**

---

### 4.3 PostHog(`lib/sources/posthog.ts`)

**Auth**:`Authorization: Bearer phx_...`(Personal API Key,scope = "Performing analytics queries")。

**Region**:`us.posthog.com`(根据 Mira 实际部署)。

**唯一端点**:`POST /api/projects/@current/query/`,body `{"query": {"kind": "HogQLQuery", "query": "<SQL>"}}`。

**4 条 HogQL**:

```sql
-- DAU trend (30d)
SELECT toString(toDate(timestamp)) AS day, count(DISTINCT distinct_id) AS dau
FROM events
WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day

-- 新增用户 trend (30d)
SELECT toString(toDate(timestamp)) AS day, count() AS n
FROM events
WHERE event = 'sign_up' AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day

-- 任务创建 trend (30d)
SELECT toString(toDate(timestamp)) AS day, count() AS n
FROM events
WHERE event = 'task_created' AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day

-- 消息发送 trend (30d)
SELECT toString(toDate(timestamp)) AS day, count() AS n
FROM events
WHERE event = 'message_sent' AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day

-- MAU
SELECT count(DISTINCT distinct_id) AS mau
FROM events
WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
```

**响应形状**:`{results: [[day, value], ...], columns: ["day", "n"]}`。每行是 array,顺序对应 columns。

**漏斗 + 留存暂时 mock**:PostHog Insights API 的 funnel / retention 请求体复杂(stages 配置),v1 没接,卡片显示 mock。

**速率限制**:2400 req/hour for Query API,看板 10s 轮询 = 360/hr,远低于上限。

---

### 4.4 Railway(`lib/sources/railway.ts`)

**Auth**:`Project-Access-Token: <UUID>`(**注意不是 Bearer**)。这是 Railway Project Token 的官方调用方式 — 之前用 Bearer 一直 401。

**Region**:无,GraphQL endpoint 全球同一个 `https://backboard.railway.app/graphql/v2`。

**GraphQL query**:
```graphql
query D($projectId: String!, $environmentId: String!) {
  deployments(input: { projectId: $projectId, environmentId: $environmentId }, first: 20) {
    edges {
      node {
        id
        status            # SUCCESS | FAILED | CRASHED | BUILDING | DEPLOYING | REMOVED
        createdAt
        service { name }
        meta              # JSON scalar(不能子查询)
      }
    }
  }
}
```

**`meta` 字段坑**:Railway schema 把 `meta` 标为 JSON scalar 类型,不能 `meta { commitHash commitMessage }` 选子字段,会报 GraphQL validation error。**必须只写 `meta`**,服务端返回完整 JSON。

**Commit 信息提取**:
- 如果 `meta.commitHash` 存在(GitHub-driven 部署)→ 用 `commitHash` + `commitMessage`
- 如果只有 `meta.cliMessage`(CLI 上传部署,如 `Deploy stable v0.59.2 (6cf256d) by lihuimingxs`)→ 正则 `/^Deploy\s+\S+\s+(v?[\d.]+)\s+\(([a-f0-9]+)\)\s+by\s+(\S+)$/` 提取 version + sha + author

**Dedup**:多次部署同一 service 时,按 `service.name` group 取最新一次(`first: 20` 返回时间倒序,Map.set 取第一次出现)。

**Postgres 服务**:Railway 托管 DB 也在 deployments 列表里,但没 commit info,UI 显示 `—`。

---

### 4.5 Statuspage.io(`lib/sources/statuspage.ts`)

**Auth**:无,公开 endpoint。

**Endpoints**:6 家固定 statuspage:
```
https://status.sentry.io/api/v2/status.json
https://www.vercel-status.com/api/v2/status.json
https://www.cloudflarestatus.com/api/v2/status.json
https://status.anthropic.com/api/v2/status.json
https://status.openai.com/api/v2/status.json
https://railway.statuspage.io/api/v2/status.json
```

**响应映射**:`status.indicator` 标准化:
- `none|maintenance` → `operational`
- `minor` → `degraded`
- `major|critical` → `down`
- 其他 / fetch 失败 → `unknown`

**并发拉取**:`Promise.all(PROVIDERS.map(...))`,每个 6s 超时,单家失败用 try/catch 标 `unknown` 不影响其他。

**已知问题**:OpenAI statuspage 当前返空响应,猜测他们换了 statuspage 提供商但保留了旧 URL。**状态会一直显示 unknown,直到他们换回标准 statuspage.io 或者我们换 URL**。

---

### 4.6 Ping(`lib/sources/ping.ts`)

**Auth**:无。

**逻辑**:
```typescript
performance.now() 起 → fetch(MIRA_HEALTH_URL, no-store) → performance.now() 止 → latencyMs
status = res.ok ? "up" : "down"
```

**超时**:8s。失败时 `status="down", latencyMs=null`,catch 内部不抛。

---

## 5. 聚合层(`lib/sources/index.ts`)

**模式**:Promise.allSettled-style + mock fallback。

```typescript
export const fetchMetrics = async (): Promise<MetricsResponse> => {
  const baseline = mockResponse();              // 所有字段 mock 填满
  const sources = baseline.sources;             // 所有源默认 ok=false, configured=false, message="mock"
  
  const [ping, statuspage, railway, growth, usage, llm, sla, vitals, crashFree] = await Promise.all([
    settled(fetchPing()),
    settled(fetchStatuspages()),
    isConfigured("railway") ? settled(fetchRailwayDeployments()) : Promise.resolve(null),
    isConfigured("posthog") ? settled(fetchGrowth()) : Promise.resolve(null),
    isConfigured("posthog") ? settled(fetchUsage()) : Promise.resolve(null),
    isConfigured("langfuse") ? settled(fetchLlmMetrics()) : Promise.resolve(null),
    isConfigured("sentry") ? settled(fetchApiSla()) : Promise.resolve(null),
    isConfigured("sentry") ? settled(fetchWebVitals()) : Promise.resolve(null),
    isConfigured("sentry") ? settled(fetchCrashFree()) : Promise.resolve(null),
  ]);
  
  // 对每个 result:
  // status === "fulfilled" → baseline.<field> = result.value;  sources.<name> = { ok: true, configured: true }
  // status === "rejected"  → 保留 mock + sources.<name> = { ok: false, configured: true, message: String(reason) }
  
  return baseline;
};
```

**关键设计:**

1. **mock 作 baseline**:任何源失败都不让卡片空着 — 仍渲染 mock 占位,badge 显示 `<source> · err`
2. **`isConfigured(source)` 短路**:env 没配的源直接 resolve(null),不浪费一次失败 fetch
3. **`settled()` helper 包装**:把 Promise 转 PromiseSettledResult,绝不 reject 主链路
4. **每源独立 ok / message**:UI badge 实时反映哪个源真实工作 / 哪个是 mock / 哪个 error,debug 友好
5. **并行而非串行**:Promise.all 让 9 个 fetch 同时发,总耗时 ≈ 最慢的那个(通常 Sentry 1-2s)

---

## 6. 缓存与刷新

**服务端**:
- `/api/metrics` 路由设 `dynamic = "force-dynamic"` + `revalidate = 0` + `Cache-Control: no-store` — 完全不缓存,每次请求都重新跑 fetchMetrics()
- 各 source client 的 fetch 也用 `cache: "no-store"` 绕过 Next.js fetch cache(主要因为 Langfuse 响应超 2MB)

**客户端**:
- TanStack Query `refetchInterval: 10_000` — 每 10s 主动 fetch /api/metrics
- `staleTime: 5_000` — 5s 内不重复请求(防止用户切 tab 触发额外请求)
- `refetchOnWindowFocus: true` — 切回浏览器立刻刷一次
- `retry: 2` — 失败重试 2 次

**最终行为**:每 10s 全链路刷一遍,从 6 个云服务拉新数据 → 聚合 → 推到前端。源失败时该卡片 fallback mock 但不影响其他。

---

## 7. 错误处理与 Fallback 矩阵

| 场景 | 表现 | 用户视角 |
|---|---|---|
| Env 未配 | source.configured=false, message="mock" | badge 显示 `<src> · mock`,outline 样式 |
| Fetch 网络失败 | settled 捕获 → source.ok=false, error msg 写入 | badge 显示 `<src> · err`,红色 destructive 样式 |
| API 返 4xx/5xx | sentryFetch/langfuse 等 throw Error → 同上 | 同上 |
| 单源失败 | aggregator 继续返其他 5 源 + 该源 mock | 其他卡片正常,失败卡片显示 mock 占位 + err badge |
| /api/metrics 整个 500 | TanStack Query retry × 2 + 顶部 header 显示 "fetch error" | 老数据保持显示 5s,然后 retry |
| dev 模式 .env 改了 | 必须 kill + restart,Turbopack 不自动 reload .env | 改 env 后 `lsof -ti :3001 \| xargs kill` 重启 |

---

## 8. 卡片 → 数据源映射(快速索引)

### Health Tab

| 卡片 | 数据源 | 处理位置 |
|---|---|---|
| 上游 SaaS 状态(6 灯) | Statuspage × 6 | `statuspage.ts` |
| 部署状态(mira-next × N + Postgres) | Railway GraphQL | `railway.ts` |
| 健康检查 ping | 自建 ping | `ping.ts` |
| API SLA(error% + P95/P99 + 24h trend) | Sentry events-stats + events | `sentry.ts::fetchApiSla` |
| Web Vitals(LCP/INP/CLS/FCP/TTFB P75) | Sentry events | `sentry.ts::fetchWebVitals` |
| Crash-free Sessions | Sentry sessions | `sentry.ts::fetchCrashFree` |
| LLM Provider 错误 | mock(Langfuse 缺 status 字段) | `mock.ts` |
| 沙箱执行 | mock(Sentry 缺 component tag) | `mock.ts` |

### Business Tab

| 卡片 | 数据源 | 处理位置 |
|---|---|---|
| DAU / MAU | PostHog HogQL | `posthog.ts::fetchGrowth` |
| 新增用户(sign_up) | PostHog HogQL | `posthog.ts::fetchGrowth` |
| 激活漏斗 | mock(PostHog Funnels API 未接) | `mock.ts` |
| 留存 D1/D7/D30 | mock(PostHog Retention API 未接) | `mock.ts` |
| 任务创建(task_created) | PostHog HogQL | `posthog.ts::fetchUsage` |
| 消息发送(message_sent) | PostHog HogQL | `posthog.ts::fetchUsage` |
| Token & 成本 by Model | Langfuse metrics/daily | `langfuse.ts::fetchLlmMetrics` |
| 工具调用 Top 8 | Langfuse observations | `langfuse.ts::fetchLlmMetrics` |
| 平均任务成本 | Langfuse metrics/daily(totalCost / countTraces) | `langfuse.ts::fetchLlmMetrics` |

---

## 9. 运行 / 部署

### 本地开发

```bash
cd /Users/tim/career/jsProject/mira-monitor

# 配 secret
cp .env.example .env.local
# 编辑 .env.local 填入 5 组 keys(PostHog / Langfuse / Sentry / Railway / Health URL)

# 启动
./node_modules/.bin/next dev --port 3001

# 浏览器
open http://localhost:3001
```

**env 改动后必须重启**:Turbopack 不自动 reload `.env.local`,改 env 后:
```bash
lsof -ti :3001 | xargs kill && ./node_modules/.bin/next dev --port 3001
```

### 部署(待做)

目标:Railway 上挂一个 service,跟 Mira team 同 workspace,共享 env vars。

未做:
- 重新加 auth(Basic Auth middleware 已删,公网部署前必须加回)
- Dockerfile / railway.toml
- CI

---

## 10. 已知坑 & TODO

| 项 | 状态 | 说明 |
|---|---|---|
| Mira `browserTracingIntegration` 没开 `enableInp` | 待补 mira-work | INP 卡片显示 `—` 直到补埋点 |
| Langfuse trace 没标 `status` 字段 | 待补 mira-work | 任务成功率 / LLM provider 错误率算不准 |
| Sentry 沙箱错误没 `component=sandbox` tag | 待补 mira-work | 沙箱卡片只能 mock |
| OpenAI statuspage 返空响应 | 待 OpenAI 修(或换 URL) | 该灯一直 unknown |
| Mira 内 LLM model 命名不一致 | mira-monitor 已加 alias + 兜底单价(`lib/sources/langfuse.ts`);彻底闭环仍需 mira-work 统一命名 | `claude-sonnet-4-6` / `anthropic/claude-sonnet-4-6` / `anthropic/claude-sonnet-4.6` 三种写法并存,后两种 Langfuse 价格表算 $0(已被 mira-monitor 的 `MODEL_ALIASES` + `FALLBACK_PRICES` 修复) |
| Sentry 采样率 50% | 设计选择 | P95/P99 数字有偏差,卡片下显示 sampling note |
| PostHog Funnels / Retention | 待接 | 漏斗 + 留存卡片当前 mock |
| API P99 包含 SSE 长连接 | 待加 filter | `/api/task` 类 streaming transaction 算到 P99 里,数字偏高;可以 `&query=!transaction:/api/task/*` 排除 |
| Basic Auth 已删 | 改为公网部署前要加回 | 当前 dev 阶段无认证 |

---

## 11. v2 路线图:Cost 面板 + 告警(规划中,未实施)

v1 是无状态实时聚合 — 所有数据 10s 拉一次,不落地。v2 加两个独立 track,**都需要存储 + 主动行为**(被推 / 推出去),架构上从"纯只读看板"变成"看板 + 数据接收器 + 告警发射器"。

### 11.1 架构变化总览

```
                                                          ┌───────────────────────────┐
                                                          │ 你的数据抓取 pipeline      │
                                                          │ (海外 LLM/Exa/Railway/    │
                                                          │  Apollo 用量已在你这边汇总)│
                                                          └─────────────┬─────────────┘
                                                                        │
                                                                        │ HTTP POST(每日 1 次或多次)
                                                                        ▼
                                              ┌─────────────────────────────────────────────┐
                                              │ POST /api/ingest/cost                       │
                                              │   - Bearer <INGEST_TOKEN> 守门              │
                                              │   - Zod 校验 payload                         │
                                              │   - Upsert into SQLite                      │
                                              └─────────────────────┬───────────────────────┘
                                                                    │
                                              ┌─────────────────────▼───────────────────────┐
                                              │ SQLite(bun:sqlite,文件持久化)              │
                                              │                                             │
                                              │  daily_cost (date,source,line_item,...)     │
                                              │  source_snapshot (date,source,balance,...)  │
                                              │  alert_state (rule_id,state,fired_at,...)   │
                                              │  alert_history (rule_id,fired_at,...)       │
                                              └────────┬────────────────────────────┬───────┘
                                                       │                            │
                                                       ▼                            ▼
                              ┌────────────────────────────────┐    ┌──────────────────────────────────┐
                              │ GET /api/cost                  │    │ alert engine                     │
                              │   读 SQLite,返时序 + 当日明细  │    │ - 在 /api/metrics 评估周期内跑   │
                              └─────────────┬──────────────────┘    │ - 加载 yaml 规则                 │
                                            │                       │ - 对比 metric vs threshold       │
                                            ▼                       │ - state machine(firing/resolved│
                              ┌────────────────────────────────┐    │   + cooldown)                   │
                              │ Cost Tab(新增)                │    │ - 状态变更时推 webhook           │
                              │   - 4 个源 card                │    └─────────────┬────────────────────┘
                              │   - 30d 折线趋势               │                  │
                              │   - 当日明细 drill-down        │                  │ HTTP POST(state-change 时)
                              └────────────────────────────────┘                  ▼
                                                                    ┌──────────────────────────────────┐
                                                                    │ 你提供的告警 webhook             │
                                                                    │ (飞书机器人 / 内部告警系统 etc.) │
                                                                    └──────────────────────────────────┘
```

**关键差异**:
- v1 每次请求都重新 fetch upstream;v2 cost 数据**只读 SQLite**,不依赖外部源即时可用
- v1 不需要主动行为;v2 告警引擎在每次 /api/metrics 后**主动评估 + 推 webhook**(state 变化时)
- v1 全部 in-memory;v2 写盘 → 部署要考虑 volume mount(Railway 部署时 SQLite 文件需挂在 persistent volume)

### 11.2 Track 1:Cost / FinOps

#### 11.2.1 接收契约 `POST /api/ingest/cost`

**Auth**:`Authorization: Bearer <INGEST_TOKEN>` (env `INGEST_TOKEN`)

**Body**:
```json
{
  "date": "2026-05-13",
  "snapshots": [
    {
      "source": "ai-gateway",
      "balance_usd": 715.20,
      "items": [
        {
          "line_item": "anthropic/claude-sonnet-4.6",
          "cost_usd": 607.65,
          "request_count": 5179,
          "metadata": {
            "input_tokens": 45400000,
            "output_tokens": 7300000,
            "cache_read": 376600000,
            "cache_write": 102300000
          }
        }
      ]
    },
    { "source": "exa", "items": [ { "line_item": "Summaries", "cost_usd": 3.904, "request_count": 3904 } ] },
    { "source": "railway", "items": [ { "line_item": "monthly_estimate", "cost_usd": 148.09 } ] },
    { "source": "apollo", "items": [ { "line_item": "mixed_people/api_search", "request_count": 80, "cost_usd": 86.00 } ] }
  ]
}
```

**幂等**:PK `(date, source, line_item)` upsert,同一天重复推不会重复计。
**Validation**:zod schema,失败返 400 + 详细错误。
**Idempotency-Key**(可选):header `Idempotency-Key`,服务端去重相同 key 的请求。

#### 11.2.2 SQLite Schema

```sql
CREATE TABLE daily_cost (
  date         TEXT NOT NULL,         -- '2026-05-13'
  source       TEXT NOT NULL,         -- 'ai-gateway' | 'exa' | 'railway' | 'apollo'
  line_item    TEXT NOT NULL,         -- 'anthropic/claude-sonnet-4.6' | 'Summaries' | 'monthly_estimate' | ...
  cost_usd     REAL NOT NULL DEFAULT 0,
  request_count INTEGER,
  metadata     TEXT,                  -- JSON blob(tokens / period / 自由字段)
  recorded_at  TEXT NOT NULL,         -- ISO8601, last write time
  PRIMARY KEY (date, source, line_item)
);

CREATE INDEX idx_daily_cost_date ON daily_cost(date);
CREATE INDEX idx_daily_cost_source ON daily_cost(source, date);

CREATE TABLE source_snapshot (
  date         TEXT NOT NULL,
  source       TEXT NOT NULL,
  balance_usd  REAL,                  -- 剩余余额(如 AI Gateway 充值制账户)
  total_cost_usd REAL,                -- 当日总成本(冗余 sum,for fast lookup)
  total_requests INTEGER,
  metadata     TEXT,                  -- JSON
  recorded_at  TEXT NOT NULL,
  PRIMARY KEY (date, source)
);
```

**冗余 `total_cost_usd`** 是为了 30d 折线图查询快(不用 GROUP BY)。Trade-off:写入时双写(detail + summary),读取时一表搞定。

#### 11.2.3 暴露给 UI:`GET /api/cost`

返回结构:
```json
{
  "today": "2026-05-13",
  "summary": {
    "ai-gateway": { "cost_usd": 630.56, "balance_usd": 715.20, "request_count": 14237 },
    "exa": { "cost_usd": 9.33, "request_count": 5740 },
    "railway": { "cost_usd": 148.09, "metadata": { "period": "month_to_date" } },
    "apollo": { "cost_usd": 86.00, "request_count": 172 }
  },
  "trend30d": {
    "ai-gateway": [{ "date": "2026-04-14", "cost_usd": 502.11 }, ...],
    "exa": [...],
    "railway": [...],
    "apollo": [...]
  },
  "breakdown_today": {
    "ai-gateway": [
      { "line_item": "anthropic/claude-sonnet-4.6", "cost_usd": 607.65, "request_count": 5179 },
      ...
    ],
    ...
  }
}
```

#### 11.2.4 UI:新增 Cost Tab

| 卡片 | 内容 |
|---|---|
| AI Gateway | 当日 $$$ + 剩余余额 + 30d 折线 + Top 3 模型 |
| Exa | 当日 $$ + 4 个 line item 横向 bar + 30d 折线 |
| Railway | 月度预估 + 历史月度 bar |
| Apollo | 当日 request 数 + 估算 $$ + endpoint 调用分布 |
| 总览 | 4 源 stacked area chart(30d 累计成本走势)|

布局:跟当前 Tab 一致,3 column grid,深色 + sparkline。

### 11.3 Track 2:告警

#### 11.3.1 规则配置(`alerts.yaml`,Git 管理)

```yaml
realtime_rules:
  - id: ping-down
    description: Mira 主站 /api/health 不通
    metric: health.ping.status
    condition: { op: "!=", value: "up" }
    severity: critical
    cooldown_minutes: 5

  - id: deploy-failed
    description: Railway service 部署失败
    metric: health.deploy[*].status
    condition: { op: "in", value: ["FAILED", "CRASHED"] }
    severity: critical
    cooldown_minutes: 10

  - id: upstream-saas-down
    description: 上游 SaaS down
    metric: health.upstream[*].status
    condition: { op: "==", value: "down" }
    severity: warning
    cooldown_minutes: 30

  - id: api-error-rate-high
    description: API 24h 错误率超 1%
    metric: health.apiSla.errorRate24h
    condition: { op: ">", value: 0.01 }
    severity: warning
    cooldown_minutes: 60

  - id: api-p95-high
    description: API P95 > 3s
    metric: health.apiSla.p95LatencyMs
    condition: { op: ">", value: 3000 }
    severity: warning
    cooldown_minutes: 60

  - id: crash-free-low
    description: Crash-free sessions < 99%
    metric: health.crashFree.rate
    condition: { op: "<", value: 0.99 }
    severity: critical
    cooldown_minutes: 30

  - id: web-vitals-lcp-poor
    description: LCP P75 > 2.5s
    metric: health.webVitals.lcpP75
    condition: { op: ">", value: 2500 }
    severity: info
    cooldown_minutes: 240

  - id: source-error
    description: 上游数据源 fetch 失败
    metric: sources.*.ok
    condition: { op: "==", value: false, where: "configured == true" }
    severity: info
    cooldown_minutes: 30

# v2 后续(等业务指标确定)
business_rules:
  - id: dau-drop
    description: DAU 较 7d 均值下降 > 30%
    metric: business.growth.dau
    condition: { op: "wow_drop", value: 0.30 }
    severity: warning
    cooldown_minutes: 240
    eval_interval: 5m       # 业务指标定时跑,不跟随 10s metrics

  - id: daily-cost-spike
    description: 当日 LLM 成本 > $1000
    metric: business.llm.totalCost24h
    condition: { op: ">", value: 1000 }
    severity: critical
    cooldown_minutes: 240
```

**两类规则的运行时差异**:
- `realtime_rules`:跟随每次 `/api/metrics`(10s)评估。适合 health/SLA 这种"状态型"指标。
- `business_rules`:独立 cron,默认 5min。适合"趋势型"指标(需要历史对比的)。

#### 11.3.2 状态机

```
              ┌─────────────┐
              │   normal    │ (规则未触发)
              └──────┬──────┘
                     │ condition matched
                     ▼
              ┌─────────────┐  notify webhook { status: firing }
              │   firing    │─────────────────────────────────────┐
              └──────┬──────┘                                     │
                     │ condition still matched within cooldown    │
                     │   → silent(do NOT notify again)            │
                     │                                            │
                     │ condition cleared                          │
                     ▼                                            │
              ┌─────────────┐  notify webhook { status: resolved }│
              │  resolved   │─────────────────────────────────────┘
              └──────┬──────┘
                     │ (transient state, immediately → normal)
                     ▼
                  normal
```

**Cooldown 行为**:
- 状态 `firing` 后,即使条件持续 true,只在 `cooldown_minutes` 过后才**重新**通知(避免刷屏)
- 状态从 `firing` → `resolved` 必通知一次("恢复了")
- 用户可手动 silence 某规则 N 小时(写 alert_state.silenced_until)

#### 11.3.3 SQLite Schema

```sql
CREATE TABLE alert_state (
  rule_id          TEXT PRIMARY KEY,
  state            TEXT NOT NULL,         -- 'normal' | 'firing'
  current_value    TEXT,                  -- 触发时的值(JSON,因为可能是 object)
  fired_at         TEXT,                  -- 进入 firing 的时间
  last_notified_at TEXT,                  -- 上次推 webhook 的时间(算 cooldown)
  silenced_until   TEXT                   -- 手动 silence 截止时间
);

CREATE TABLE alert_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id          TEXT NOT NULL,
  status           TEXT NOT NULL,         -- 'firing' | 'resolved'
  severity         TEXT NOT NULL,
  current_value    TEXT,
  threshold        TEXT,
  fired_at         TEXT NOT NULL,
  notified         INTEGER DEFAULT 0      -- 0 = 抑制(cooldown 内),1 = 已通知
);

CREATE INDEX idx_alert_history_rule ON alert_history(rule_id, fired_at DESC);
```

#### 11.3.4 推送契约(发给你的告警系统)

```
POST <ALERT_WEBHOOK_URL>
Authorization: Bearer <ALERT_WEBHOOK_TOKEN>   (可选,看你的接收方)
Content-Type: application/json

{
  "rule_id": "api-error-rate-high",
  "severity": "warning",
  "status": "firing",                      # firing | resolved
  "title": "Mira API 24h 错误率超阈值",
  "summary": "当前 2.34%,阈值 1%",
  "current_value": 0.0234,
  "threshold": 0.01,
  "metric_path": "health.apiSla.errorRate24h",
  "triggered_at": "2026-05-14T10:23:45Z",
  "dashboard_url": "http://mira-monitor/health"
}
```

**契约可调** — 你方接收端期望什么字段,我适配你。

#### 11.3.5 评估器实现位置

```typescript
// lib/alerts/engine.ts
export async function evaluateRealtimeRules(metrics: MetricsResponse): Promise<void> {
  const rules = loadRules("realtime");
  for (const rule of rules) {
    const value = extractMetric(metrics, rule.metric);
    const matched = evaluateCondition(value, rule.condition);
    const state = await getAlertState(rule.id);

    if (matched && state.state === "normal") {
      await transition(rule, "firing", value);
      await pushWebhook(rule, "firing", value);
    } else if (matched && state.state === "firing") {
      // already firing, check cooldown for re-notify
      if (cooldownElapsed(state, rule)) {
        await pushWebhook(rule, "firing", value);
        await updateLastNotified(rule.id);
      }
    } else if (!matched && state.state === "firing") {
      await transition(rule, "normal", value);
      await pushWebhook(rule, "resolved", value);
    }
  }
}
```

**调用点**:`app/api/metrics/route.ts` 的 GET handler 拿到 MetricsResponse 后,**fire-and-forget** 调一次(不阻塞响应):
```typescript
const data = await fetchMetrics();
// don't await; let alerting run in background
evaluateRealtimeRules(data).catch((e) => console.error("alert engine failed", e));
return NextResponse.json(data);
```

业务规则的 cron(`business_rules`)在单独的 Bun timer 里跑,或者外部 cron(Railway 的 cron service)。

### 11.4 实施 Roadmap

| Step | 内容 | 阻塞 |
|---|---|---|
| **A** | 加 `bun:sqlite` 依赖 + 建表 migration + storage layer | — |
| **B** | 加 `POST /api/ingest/cost` endpoint(Bearer + zod + upsert)| A |
| **C** | 加 `GET /api/cost` endpoint + Cost Tab UI | B + 收到首批推送数据 |
| **D** | 加 `alerts.yaml` 规则文件 + 评估器 + state machine | A |
| **E** | 加 webhook push client | D + 用户给 webhook URL |
| **F** | 加 alert history UI 子页(看历史触发记录)| D + E |
| **G** | 部署到 Railway:挂 volume 给 SQLite + 加回 auth(Basic Auth 或 SSO)| C 或 F |

**ABC** 一组(Cost track,4-5 天)、**DEF** 一组(Alert track,3-4 天)、**G** 收尾(0.5 天)。Cost 和 Alert 两组**独立可并行**。

### 11.5 待确认的 4 件事(实施前的 blocker)

| # | 决策点 | 默认/推荐 |
|---|---|---|
| 1 | Cost ingest payload 格式 | 按 §11.2.1 提议 / 或用你 pipeline 现有格式 |
| 2 | 告警 webhook URL + 期望 payload | 等你方接收端 endpoint + payload spec |
| 3 | `INGEST_TOKEN` 值(守门 cost ingest 端点) | 用户生成 / 让我生成 |
| 4 | 8 条 health 实时告警规则是否全开 | 默认全开,后续按 cooldown / severity 调 |

### 11.6 v2 增加的依赖与文件

**新依赖**:
- `bun:sqlite`(Bun 内置,无需 npm install)— 如果跑在 Node.js 模式可能要 `better-sqlite3`
- `zod` — payload 校验

**新文件**:
```
lib/
├── db/
│   ├── client.ts                 SQLite 单例 + migrations
│   ├── schema.sql                建表 DDL
│   └── queries/
│       ├── cost.ts               daily_cost upsert / read 查询
│       └── alerts.ts             alert_state / alert_history 查询
│
├── alerts/
│   ├── engine.ts                 评估 + state transition
│   ├── rules.ts                  yaml load + 解析
│   ├── condition.ts              op 解析(>, <, in, wow_drop 等)
│   ├── extract.ts                metric path → value 提取(支持 health.apiSla.errorRate24h / health.deploy[*].status)
│   └── notify.ts                 webhook push client
│
app/api/
├── ingest/
│   └── cost/route.ts             POST,Bearer 守门
└── cost/route.ts                 GET,读 SQLite

components/
├── tabs/cost-tab.tsx             新 Tab
├── cards/cost-{ai-gateway,exa,railway,apollo}.tsx
└── cost-trend-chart.tsx          stacked area 30d
```

新增约 12 个文件,**对 v1 现有 17 卡片 0 影响**(共享 layout / page,新增 1 个 Tab 入口而已)。

