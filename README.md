# Mira Monitor

Mira 海外版的全局监控大屏。3 个 Tab(基础服务健康度 · 业务看板 · 费用监控),16+ 卡片,统一从 `/api/metrics` 一个端点聚合多个数据源,前端 10s 轮询。

## 状态

- **v1 已完成**:17 个实时卡片 + 5 个 mock 费用卡片
  - Health Tab(8 卡片):上游 SaaS 状态 / 部署 / 心跳 / API SLA / Web Vitals / Crash-free / LLM Provider / 沙箱
  - Business Tab(9 卡片):DAU/MAU / 新增用户 / 漏斗 / 留存 / 任务 / 消息 / Token & 成本 / 工具调用 / 平均任务成本
  - Cost Tab(5 卡片,mock):AI Gateway / Exa / Railway / Apollo / 30d 趋势
- **v2 规划中(未实施)**:Cost 数据 ingest 端点 + SQLite 持久化 + 告警引擎 + webhook 推送。详见 [架构文档 §11](docs/architecture.md#11-v2-路线图cost-面板--告警规划中未实施)。

## 数据源现状

| 源                | 状态      | 用途                                             |
| ----------------- | --------- | ------------------------------------------------ |
| Statuspage.io × 6 | ✅ 真数据 | Sentry/Vercel/CF/Anthropic/OpenAI/Railway 状态灯 |
| Railway GraphQL   | ✅ 真数据 | 部署状态 + commit + 版本                         |
| 心跳 ping         | ✅ 真数据 | 主站 `/api/health` 可用性 + 延迟                 |
| Sentry SaaS       | ✅ 真数据 | API 错误率 / P95 P99 / Web Vitals / Crash-free   |
| Langfuse Cloud    | ✅ 真数据 | LLM token / cost / 模型分布 / 工具调用           |
| PostHog Cloud     | ✅ 真数据 | DAU/MAU / 新增 / 任务 / 消息                     |
| Cost 推送端点     | ⚪ mock   | 等 v2 接入 `POST /api/ingest/cost`               |

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
| `RAILWAY_TOKEN` + `RAILWAY_PROJECT_ID` + `RAILWAY_ENVIRONMENT_ID` | 部署状态                  | Railway → Project Settings → Tokens                                                 |
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

## 部署 TODO

当前是本地 dev 形态,**未部署**。上线前要:

- [ ] 加回认证(Basic Auth middleware 或 SSO,删除 dev 阶段的无认证状态)
- [ ] 写 `Dockerfile` + `railway.toml`(参考 mira-work 主仓 railway.toml)
- [ ] Railway 部署 + 挂 secret 到 env(不要进 Git)
- [ ] v2 SQLite 落地时挂 persistent volume

## 已知坑 / 后续优化

详见 [架构文档 §10 已知坑 & TODO](docs/architecture.md#10-已知坑--todo)。简要列表:

- Mira 主站 `browserTracingIntegration` 没开 `enableInp` → INP 卡片永远 `—`
- Langfuse trace 没标 `status` → 任务成功率算不准,LLM provider 错误率走 mock
- Sentry 沙箱错误缺 `component=sandbox` tag → 沙箱卡片 mock
- OpenAI statuspage 端点返空响应 → OpenAI 灯一直 `unknown`
- Mira 内 LLM 模型命名不一致(`claude-sonnet-4-6` / `anthropic/claude-sonnet-4-6` / `anthropic/claude-sonnet-4.6`)→ Langfuse 价格表对后两种算 $0
- Sentry 采样率 50% → P95/P99 数字有偏差(卡片下有 sampling note 提示)
- API P99 含 `/api/task` 类 SSE 长连接 → 数字偏高,可加 `query=!transaction:/api/task/*` 排除
- PostHog Funnels / Retention 接口未接,漏斗 + 留存卡片当前 mock

## License

Internal — Mira Teams。
