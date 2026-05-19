# Dashboard Data Spec

> 每个卡片对应的数据源 + 查询 + 字段映射。Source of truth for `lib/sources/*.ts`.

## 数据源认证速查

| 源         | Header / Auth                                    | Endpoint base                              | Env                                                             |
| ---------- | ------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------- |
| PostHog    | `Authorization: Bearer phx_...`                  | `https://us.posthog.com`                   | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_HOST`                      |
| Langfuse   | `Authorization: Basic base64(pub:sec)`           | `https://cloud.langfuse.com`               | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`   |
| Sentry     | `Authorization: Bearer ...`                      | `https://sentry.io`                        | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`             |
| Railway    | `Project-Access-Token: <uuid>` (注意不是 Bearer) | `https://backboard.railway.app/graphql/v2` | `RAILWAY_DATASOURCE_TOKEN`, `RAILWAY_DATASOURCE_PROJECT_ID`, `RAILWAY_DATASOURCE_ENVIRONMENT_ID` |
| Statuspage | 无认证                                           | 各家 `*/api/v2/status.json`                | —                                                               |
| Ping       | 无认证                                           | `MIRA_HEALTH_URL` env                      | —                                                               |

---

## Tab 1 — 基础服务健康度

### 1. 上游 SaaS 状态(6 家灯)

- **源**: Statuspage.io JSON API
- **Endpoints**:
  - `https://status.sentry.io/api/v2/status.json`
  - `https://www.vercel-status.com/api/v2/status.json`
  - `https://www.cloudflarestatus.com/api/v2/status.json`
  - `https://status.anthropic.com/api/v2/status.json`
  - `https://status.openai.com/api/v2/status.json`
  - `https://railway.statuspage.io/api/v2/status.json`
- **字段映射**: `status.indicator` → `none|maintenance` ⇒ operational / `minor` ⇒ degraded / `major|critical` ⇒ down
- **刷新**: 60s revalidate
- **失败兜底**: status="unknown"

### 2. Mira 部署状态

- **源**: Railway GraphQL
- **Query**: `deployments(input: { projectId, environmentId }, first: 20)`
- **字段**: `node.status`, `node.createdAt`, `node.meta.commitHash`, `node.meta.commitMessage`, `node.service.name`
- **逻辑**: group by service.name,取每个 service 最新一次 deploy
- **刷新**: 30s revalidate

### 3. Mira `/api/health` ping

- **源**: 自建心跳
- **Target**: `MIRA_HEALTH_URL` (default `https://mira.day/api/health`)
- **字段**: HTTP status, latencyMs (performance.now diff)
- **超时**: 8s
- **缓存**: `cache: "no-store"`(实时)

### 4. API 错误率(1h/24h)

- **源**: Sentry `events-stats`
- **Endpoint**: `GET /api/0/organizations/{org}/events-stats/?statsPeriod=24h&interval=1h&yAxis=count()&query=event.type:error+project:{project}`
- **字段**: `data[].value` 时序点 → 累加得 totals
- **采样说明**: prod 采样率 50%,卡片需标记 "采样:50%"

### 5. API P95 / P99 延迟

- **源**: Sentry Discover
- **Endpoint**: `GET /api/0/organizations/{org}/events/?field=p95(transaction.duration)&field=p99(transaction.duration)&statsPeriod=24h&dataset=transactions`
- **采样**: 50%,数字仅供参考
- **建议**: 关键 route(`/api/task`)单独提采样率到 100%

### 6. Web Vitals(LCP/INP/CLS/FCP/TTFB)

- **源**: Sentry Discover
- **Endpoint**: `GET /api/0/organizations/{org}/events/?field=p75(measurements.lcp)&field=p75(measurements.inp)&field=p75(measurements.cls)&field=p75(measurements.fcp)&field=p75(measurements.ttfb)&statsPeriod=24h&dataset=transactions`
- **注意**: Mira 当前没启用 `browserTracingIntegration` 的 `enableInp`,INP 可能稀疏

### 7. Crash-free sessions

- **源**: Sentry Sessions API
- **Endpoint**: `GET /api/0/organizations/{org}/sessions/?field=crash_free_rate(session)&field=sum(session)&statsPeriod=24h`
- **字段**: 取最新窗口的 crash_free_rate 与 sum(session)

### 8. LLM Provider 错误

- **源**: Langfuse `/api/public/observations?type=generation&fromTimestamp=...`
- **客户端聚合**: filter 失败 generation → group by `model` → count
- **限制**: 当前 Mira 没在 trace 标 status,需要补埋点才能精确算失败;先用 generation 错误反推

### 9. 沙箱错误率

- **源**: Sentry `issues` API + Langfuse span 兜底
- **Endpoint**: `GET /api/0/organizations/{org}/issues/?query=tool:code_interpreter+is:unresolved&statsPeriod=24h`
- **临时**: 需要补 `component=sandbox` tag 才能精确;v1 用 issue 标题/tool 名做近似

---

## Tab 2 — 业务看板

### 10. DAU/MAU 趋势

- **源**: PostHog HogQL
- **Query**:
  ```sql
  SELECT toDate(timestamp) AS day, count(DISTINCT distinct_id) AS dau
  FROM events
  WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
  GROUP BY day ORDER BY day
  ```
- **MAU**: 同 SQL 去掉 GROUP BY,取 distinct user count 30d

### 11. 新增用户(每日)

- **源**: PostHog HogQL
- **Query**: `SELECT toDate(timestamp), count() FROM events WHERE event='sign_up' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY 1 ORDER BY 1`
- **Note**: Mira 实际埋了 `sign_up` 事件,字段 `entry` 区分来源(`email`/`quick_activate`)

### 12. 激活漏斗(sign_up → email_verified → account_activated → task_created)

- **源**: PostHog Insights API (FUNNELS)
- **Endpoint**: `POST /api/projects/@current/insights/funnel/`
- **Body**: events array,按顺序排
- **字段**: `result[].count`, `result[].conversion_rate`

### 13. D1/D7/D30 留存

- **源**: PostHog Insights API (RETENTION)
- **Endpoint**: `POST /api/projects/@current/insights/retention/`
- **Params**: target_event=`sign_up`, returning_event=`$pageview`, period=`day`
- **MVP**: 复杂 query,先用 mock,后接

### 14. 任务量(Today + 30d)

- **源**: PostHog HogQL
- **Query**: `SELECT toDate(timestamp), count() FROM events WHERE event='task_created' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY 1 ORDER BY 1`
- **失败任务**: 加 `task_aborted` 事件统计(已埋点)

### 15. 消息量(Today + 30d)

- **源**: PostHog HogQL
- **Query**: 同上换成 `event='message_sent'`

### 16. Token 消耗 + 模型分布

- **源**: Langfuse `/api/public/metrics`
- **Params**: `dimension=["model"]`, `metrics=["count","cost","totalTokens"]`, `from/to=24h window`
- **字段**: per model 的 count, totalCost (USD), totalTokens

### 17. 工具调用 Top10

- **源**: Langfuse `/api/public/observations?type=span&fromTimestamp=...`
- **客户端聚合**: filter `name LIKE 'ai.toolCall%'` → strip prefix → count → top 10
- **优化**: 分页拉 N 页(每页 100)再聚合,避免漏

### 18. 单任务平均成本

- **源**: Langfuse `/api/public/metrics`
- **Params**: `metrics=["count","cost"]`, `dimension=["trace.name"]`, filter `name=mira-agent`
- **算法**: `avgCostPerTask = totalCost / count`

---

## 已知数据缺口(待补埋点)

| 维度                   | 现状                            | 补埋方案                                                         |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------- | --------- |
| 任务成功/失败状态      | Langfuse trace 没打 status      | 在 mira-agent 完成时 langfuse.score(traceId, "status", "success" | "failed") |
| Web Vitals INP         | Sentry `enableInp` 未开         | `browserTracingIntegration({ enableInp: true })`                 |
| LLM provider span 来源 | Sentry HTTP span 没 service tag | 在 fetch hook 里 setTag("service", "openai"/"anthropic")         |
| 沙箱专属维度           | 没 `component=sandbox` tag      | 在 sandbox lib 的 captureException 处加 tag                      |

补埋后这 4 个卡片精度大幅提升,但 MVP 不阻塞。
