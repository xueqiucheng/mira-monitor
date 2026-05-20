# Mira Monitor

Mira 海外版的全局监控大屏。3 个 Tab(基础服务健康度 · 业务看板 · 费用监控),16+ 卡片,统一从 `/api/metrics` 一个端点聚合多个数据源,前端 10s 轮询。

## 状态

- **v1 已完成**:17 个实时卡片 + Cost Tab 5 卡片
  - Health Tab(8 卡片):上游 SaaS 状态 / 部署 / 心跳 / API SLA / Web Vitals / Crash-free / LLM Provider / 沙箱
  - Business Tab(9 卡片):DAU/MAU / 新增用户 / 漏斗 / 留存 / 任务 / 消息 / Token & 成本 / 工具调用 / 平均任务成本
  - Cost Tab(5 卡片):AI Gateway / Exa / Railway / Apollo / 30d 趋势(由 Railway sibling cron service 每 30 分钟 ingest 一次落 Postgres,4 张 `cost_*_daily` 表)
- **告警引擎 + webhook 推送**:规划中未实施。详见 [架构文档 §11](docs/architecture.md#11-v2-路线图cost-面板--告警规划中未实施)。

## 数据源现状

| 源                | 状态      | 用途                                             |
| ----------------- | --------- | ------------------------------------------------ |
| Statuspage.io × 6 | ✅ 真数据 | Sentry/Vercel/CF/Anthropic/OpenAI/Railway 状态灯 |
| Railway GraphQL   | ✅ 真数据 | 部署状态 + commit + 版本                         |
| 心跳 ping         | ✅ 真数据 | 主站 `/api/health` 可用性 + 延迟                 |
| Sentry SaaS       | ✅ 真数据 | API 错误率 / P95 P99 / Web Vitals / Crash-free   |
| Langfuse Cloud    | ✅ 真数据 | LLM token / cost / 模型分布 / 工具调用           |
| PostHog Cloud     | ✅ 真数据 | DAU/MAU / 新增 / 任务 / 消息                     |
| Cost ingest      | ✅ 真数据 | AI Gateway / Exa / Railway / Apollo 每 30 分钟 ingest → Postgres |

## 快速开始

```bash
# 安装依赖(走 npmmirror 镜像,bunfig.toml 已配)
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund

# 配 env
cp .env.example .env.local
# 编辑 .env.local 填 5 组 keys:PostHog / Langfuse / Sentry / Railway / 心跳 URL

# 启动 dev
bun dev          # 推荐
# 或 npm run dev

# 浏览器
open http://localhost:3000
```

> Sentry token 必须是 **User Auth Token**(`sntryu_` 前缀,需勾 `event:read` + `org:read` + `project:read` 三个 scope),**不能用 Org Auth Token**(`sntrys_`)。详见架构文档 §4.1。

## 环境变量

详见 [`.env.example`](.env.example)。最少要 5 组:

| Env                                                               | 用途                      | 拿哪里                                                                              |
| ----------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `POSTHOG_PERSONAL_API_KEY`                                        | 业务指标                  | PostHog → Account Settings → Personal API Keys(scope: Performing analytics queries) |
| `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` + `LANGFUSE_HOST`   | LLM 用量                  | Langfuse 项目 → Settings → API Keys                                                 |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`             | 错误率 / SLA / Web Vitals | Sentry → Account Settings → Auth Tokens(注意是 User Auth)                           |
| `RAILWAY_DATASOURCE_TOKEN` + `RAILWAY_DATASOURCE_PROJECT_ID` + `RAILWAY_DATASOURCE_ENVIRONMENT_ID` | 部署状态                  | Railway → Project Settings → Tokens                                                 |
| `MIRA_HEALTH_URL`                                                 | 心跳目标                  | 默认 `https://mira.day/api/health`                                                  |

## 命令

```bash
bun dev                # 起 dev server(turbopack,热重载,默认 3000 端口)
bun run build          # 生产构建
bun run start          # 生产启动
bun run typecheck      # TypeScript 类型检查(无产物)
bun run build:docs     # 由 docs/architecture.md 生成 docs/architecture.html
```

## 目录结构

```
mira-monitor/
├── app/                          Next.js App Router
│   ├── api/
│   │   ├── metrics/route.ts      聚合 endpoint(GET)
│   │   └── health/route.ts       dashboard 自身健康检查
│   ├── layout.tsx                根布局 + 字体 + QueryProvider
│   └── page.tsx                  3 个 Tab 主页
│
├── components/
│   ├── tabs/                     {health,business,cost}-tab.tsx
│   ├── cards/                    各卡片(共 22 个组件,含 cost-* 和 card-shell)
│   ├── providers/                QueryProvider 单例
│   └── ui/                       shadcn 原语
│
├── lib/
│   ├── types.ts                  全部 metrics 类型(MetricsResponse 是总入口)
│   ├── env.ts                    env 加载 + isConfigured()
│   ├── format.ts                 格式化(数字 / $ / ms / 相对时间)
│   ├── utils.ts                  shadcn cn() helper
│   └── sources/
│       ├── index.ts              聚合器(Promise.allSettled + mock baseline)
│       ├── mock.ts               全量 mock(每个源失败时的 fallback)
│       ├── ping.ts               心跳
│       ├── statuspage.ts         6 家 statuspage 并发拉
│       ├── railway.ts            GraphQL deployments
│       ├── posthog.ts            HogQL 4 条 SQL
│       ├── langfuse.ts           metrics/daily + observations
│       └── sentry.ts             events-stats + events + sessions
│
├── hooks/use-metrics.ts          TanStack Query 钩子(10s 轮询)
├── docs/
│   ├── architecture.md           完整架构 + 数据流向 + v2 路线图(权威)
│   ├── architecture.html         同上,HTML 渲染版,浏览器直接开
│   └── dashboard-data-spec.md    每卡片对应 query 的早期 spec
└── scripts/
    └── build-architecture-html.ts  MD → HTML 转换
```

## 添加新卡片(给协作者)

1. 在 `lib/types.ts` 加 metrics 数据类型,挂到 `HealthTabData` / `BusinessTabData` / `CostTabData`
2. 在 `lib/sources/mock.ts` 加该字段的 mock(用于 fallback 和未配置源的占位)
3. 如果对应新数据源,在 `lib/sources/` 加一个 `<name>.ts`,实现 `fetch<Name>()`;否则跳过
4. 在 `lib/sources/index.ts` 的 `Promise.all` 里 settled-包一下,失败时保留 mock + 写 `sources.<name>.message`
5. 在 `components/cards/` 加 `<name>.tsx`,用 `<CardShell title source>` 包一层,内部按数据形状写 UI
6. 在对应 `components/tabs/<x>-tab.tsx` 加进 grid

## 架构

完整数据流、各源 API 处理、缓存策略、错误处理、v2 设计:

- **Markdown 版本(权威)**:[`docs/architecture.md`](docs/architecture.md)
- **HTML 版本(浏览器开)**:[`docs/architecture.html`](docs/architecture.html)

改完 `docs/architecture.md` 跑 `bun run build:docs` 重新生成 HTML。

## 部署到 Railway

通过 **GitHub Actions 手动触发** 把镜像推到 Railway。流程:

```
本地 push → GitHub → Actions 页面手点 "Run workflow" → typecheck + build → railway up
```

构建走根目录的 `Dockerfile`(Next.js standalone),健康检查 `/api/health`,Basic Auth middleware 拦截所有非 health 请求。

### 部署结构

monitor 走独立 Railway project,跟 mira 主站完全隔离(费用/权限/故障互不影响):

```
mira-monitor (Railway project)
└── production (默认环境)
    └── mira-monitor (service)
```

### 一次性配置

1. **在 Railway 新建 project + service**

   - Railway 控制台 → New Project → **Empty Project** → 命名 `mira-monitor`。新建后默认有一个 `production` 环境。
   - 在 production 里 → New Service → **Empty Service** → 命名 `mira-monitor`(跟 workflow 里默认输入对得上)。
   - 暂时**不要**接 GitHub repo,我们用 GH Actions 主动推、不用 Railway 自带的 GitHub 自动构建。

2. **拿 Railway Project Token**

   Railway → mira-monitor 项目 → Settings → Tokens → New Project Token → Environment 选 `production` → 复制。

   Project Token 锁死在这个 project + 环境,泄漏只影响 monitor,不会牵扯 mira 主站。

3. **在 GitHub 仓库配 Secret**(Settings → Secrets and variables → Actions)

   | Secret 名 | 值 | 用途 |
   | --- | --- | --- |
   | `RAILWAY_DEPLOY_TOKEN` | 上一步的 Project Token | GH Action 用 `railway up` 推镜像 |

   > 业务 env(`POSTHOG_PERSONAL_API_KEY` / `LANGFUSE_*` / `SENTRY_*` / `DASHBOARD_BASIC_AUTH_PASS` 等)**不放 GH Secrets**,直接配到 Railway 服务的 Variables。完整清单见 [`.env.example`](.env.example)。

4. **在 Railway service 里配 Variables**

   mira-monitor service → Variables → 把 `.env.example` 里所有变量贴进来。重点:

   - `DASHBOARD_BASIC_AUTH_PASS` **必填**(没配 middleware 会拒所有请求,避免误把无认证 dashboard 上线)。
   - `RAILWAY_DATASOURCE_TOKEN` / `RAILWAY_DATASOURCE_PROJECT_ID` / `RAILWAY_DATASOURCE_ENVIRONMENT_ID` 是 dashboard 自己拉部署状态用的,**指向哪个 project 就填哪个**——通常你想看的是 mira 主站的部署,所以填 mira 主站的 project/env id,token 用账号级或 mira 主站的 readonly token。带 `_DATASOURCE_` 前缀是为了避开 Railway 平台自动注入的同名 `RAILWAY_PROJECT_ID` / `RAILWAY_ENVIRONMENT_ID`(那俩指向本服务自己所在的 project,跟数据源含义冲突)。
   - 端口不用配,Railway 自动注入 `$PORT`,Next.js standalone 已经读它。

### 触发部署

GitHub → Actions → **Deploy to Railway** → Run workflow → 输入 service 名(可留空) → 跑。

verify job 跑 `npm run typecheck` + `npm run build` 守闸,绿了 deploy job 才 `railway up`。

### 本地手动部署(应急用)

```bash
npm i -g @railway/cli
railway login
railway link               # 选项目和环境
railway up                 # 用本地 Dockerfile 构建并推
```

## Cost ingest 部署(费用监控)

Cost Tab 的数据由 cron sibling service **每 30 分钟 ingest 一次**(北京时间 8:00 - 23:30 营业时段,白天日内多次刷新)落进 Postgres,web service 读 4 张 `cost_*_daily` 表渲染。需要在同一个 Railway project 里加两样东西:**一个 Postgres + 一个 sibling cron service**。

```
mira-monitor (Railway project)
└── production
    ├── Postgres                    ← 同 project 新建,DATABASE_URL 自动注入 web service
    ├── mira-monitor (web)          ← 现有,Next.js 常驻,渲染 Cost Tab + 暴露 /api/ingest/cost
    └── mira-monitor-cron (new)     ← 新增,北京 8:00-23:30 每 30 分钟触发 ingest
```

### 1. 加 Postgres

Railway → mira-monitor project → **+ New → Database → PostgreSQL**。建好后到 mira-monitor web service 的 Variables 里 **Reference** 这个 DB 的 `DATABASE_URL`(Railway 会自动注入)。

**表结构通过 migration 自动同步**——跟 mira 主站 (`apps/mira-work/lib/db/migrate.ts`) 同款模式:

- migration 文件在 [lib/db/migrations/](lib/db/migrations/),`NNN_<name>.sql` 按文件名升序执行
- `000_schema_migrations.sql` 是 bootstrap(建跟踪表),由 runner 引导
- 每个 migration 包一个事务 + INSERT 进 `schema_migrations` 表;失败 ROLLBACK
- 通过 `pg_advisory_lock` 防止 cron 跟 web 同时跑互相打架
- `runMigrations()` 在 ingest 启动时 + web 服务首次读 Cost Tab 时各跑一次(module-level flag,每个进程只发一次 SQL)

加新 migration:

```bash
# 1. 加文件
echo "ALTER TABLE cost_ai_gateway_daily ADD COLUMN IF NOT EXISTS notes TEXT;" \
  > lib/db/migrations/002_ai_gateway_notes.sql

# 2. 本地验证(或线上让自动 runner 跑)
bun run db:migrate
```

下次部署后,ingest 或 web 首次启动会自动应用新 migration。手动跑也行:`bun run db:migrate`。

### 2. Web service 加新环境变量

mira-monitor (web) service → Variables,补:

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | Reference 上面那个 Postgres,Railway 自动填 |
| `COST_INGEST_TOKEN` | 长一点的随机字符串(自己生成),`POST /api/ingest/cost` 用 `Authorization: Bearer` 校验它 |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway 的 API key |
| `EXA_SERVICE_KEY` + `EXA_API_KEY_IDS` | Exa 服务 key + 监控的 API key id(逗号分隔) |
| `APOLLO_MASTER_API_KEY` | Apollo Master API key |

Railway provider 不用新加 token:[`RAILWAY_DATASOURCE_TOKEN`](#) 已经存在,ingest 复用同一个拉 `estimatedUsage` GraphQL。

### 3. 新增 sibling cron service

Railway → project → **+ New → Empty Service** → 命名 `mira-monitor-cron`。然后:

1. **Source / Image**:用 Docker Hub 上的 **`alpine/curl:latest`**(~10MB,自带 curl + sh)
   - ⚠️ **不要用 `curlimages/curl:latest`**——它的 `ENTRYPOINT` 锁死成 `curl`,Railway 的 Start Command 不经过 shell,`$VAR` 不展开,curl 会拿到字面字符串 `"$INGEST_URL"` 报 `Bad hostname`
2. **Start Command** 覆盖成(注意外层用 `sh -c '...'` 包裹,内部环境变量才能展开):
   ```bash
   sh -c 'curl -fsS -X POST -H "Authorization: Bearer $COST_INGEST_TOKEN" "$INGEST_URL"'
   ```
3. **Variables**:
   - `COST_INGEST_TOKEN` — Reference web service 同名变量(保持一致)
   - `INGEST_URL` — `https://<web-service-domain>/api/ingest/cost`(用 Railway 给 web service 自动生成的内部域名)
4. **Settings → Cron Schedule**:`*/30 0-15 * * *`(UTC,即北京时间 8:00 - 23:30 每 30 分钟一次,一天 32 次。Railway cron 用 UTC,8 北京 = 0 UTC,23:30 北京 = 15:30 UTC)
5. **Settings → Restart Policy**:Never(cron 模式下跑完就退,不要自动拉起)

这样配完,**北京 8:00 起每 30 分钟 Railway 拉起 cron service → curl 打 web service → web service 跑 4 个 provider 拉数据 → UPSERT 进 Postgres → cron service 退出**。Web service 全程不重启,Cost Tab 下一次 10s 轮询就看到新数据。每次 ingest 5-15 秒,cron service 跑完就退,平时不占常驻资源。

### 4. 本地回填 / 调试

```bash
# 用今日(北京时间)拉,UPSERT 进本地或远端 Postgres
bun run ingest:cost

# 回填某一天(注意 provider API 通常只支持近 90 天)
bun run ingest:cost 2026-05-19

# 或者用 curl 打线上 web service(快速验证 endpoint 通)
curl -fsS -X POST \
  -H "Authorization: Bearer $COST_INGEST_TOKEN" \
  "https://<web-service-domain>/api/ingest/cost?date=2026-05-19"
```

### v2 持久化(已落地,本节备忘)

Postgres 加上之后,Cost Tab 不再依赖 mock,30 天趋势从 `cost_*_daily` LEFT JOIN 出来。如果以后要做对账(Vercel AI Gateway 收的钱 vs mira `usage` 表实际入库的钱),按 reference 实现 (`/mnt/d/WorkSpace/crm-wsl-1/mira/apps/mira-monitor/src/reports/reconcile.ts`)再加一张 `reconcile_report` 表 + 一个只读 `MIRA_DATABASE_URL` 配置。

## 已知坑 / 后续优化

详见 [架构文档 §10 已知坑 & TODO](docs/architecture.md#10-已知坑--todo)。简要列表:

- Mira 主站 `browserTracingIntegration` 没开 `enableInp` → INP 卡片永远 `—`
- Langfuse trace 没标 `status` → 任务成功率算不准,LLM provider 错误率走 mock
- Sentry 沙箱错误缺 `component=sandbox` tag → 沙箱卡片 mock
- OpenAI statuspage 端点返空响应 → OpenAI 灯一直 `unknown`
- ~~Mira 内 LLM 模型命名不一致(`claude-sonnet-4-6` / `anthropic/claude-sonnet-4-6` / `anthropic/claude-sonnet-4.6`)→ Langfuse 价格表对后两种算 $0~~ → `lib/sources/langfuse.ts` 已加 `MODEL_ALIASES` 规范化 + `FALLBACK_PRICES` 兜底重算（Sonnet 4.6 / Haiku 4.5 按 Anthropic 官方单价）；主站命名彻底统一后这段可拆
- Sentry 采样率 50% → P95/P99 数字有偏差(卡片下有 sampling note 提示)
- API P99 含 `/api/task` 类 SSE 长连接 → 数字偏高,可加 `query=!transaction:/api/task/*` 排除
- PostHog Funnels / Retention 接口未接,漏斗 + 留存卡片当前 mock

## License

Internal — Mira Teams。
