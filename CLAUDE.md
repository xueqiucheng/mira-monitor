# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mira (海外版) 全局监控大屏. Next.js 16 App Router app that aggregates 6 upstream SaaS data sources into a single `/api/metrics` endpoint, polled every 10s by a 3-tab dashboard (Health · Business · Cost). **v1 is stateless** — no DB, every render = one fan-out. v2 (SQLite + cost ingest + alerting) is planned but **not implemented**.

Authoritative architecture doc: [docs/architecture.md](docs/architecture.md) (HTML mirror: [docs/architecture.html](docs/architecture.html), regenerated via `bun run build:docs`). Read it before non-trivial changes — it covers each source's auth quirks, query shapes, and known data gaps.

## Commands

```bash
bun dev                # dev server (turbopack, :3000) — preferred
bun run build          # next build (produces standalone)
bun run typecheck      # tsc --noEmit — the only "test" gate
bun run build:docs     # docs/architecture.md → docs/architecture.html
```

- **Package manager**: `npm install --registry=https://registry.npmmirror.com --no-audit --no-fund`. `bunfig.toml` pins npmmirror because bun's resolver is unstable on the user's network.
- **No test suite, no linter config**. The typecheck script is the merge gate; CI also runs `npm run build` before `railway up`.
- **Auth wall**: every request except `/api/health` is gated by Basic Auth in [middleware.ts](middleware.ts). If `DASHBOARD_BASIC_AUTH_PASS` is unset the middleware **rejects all requests by design** (fail-closed). Set it in `.env.local` before `bun dev` or browsing will 401.

## Architecture (the parts that aren't obvious from filenames)

### Single endpoint, mock baseline, settled fan-out

The whole data layer lives in [lib/sources/index.ts](lib/sources/index.ts). The pattern is:

1. `baseline = mockResponse()` — every field starts populated with mock so the UI never has null-shaped data.
2. `Promise.all([settled(fetchX), ...])` — every source is wrapped in `settled()` so one failure doesn't break the response.
3. For each source: if `isConfigured(name)` is false, skip entirely (skipped sources keep mock + show as "unconfigured"). If configured but throws, the mock stays and `sources[name].message` records the error string.
4. UI reads `sources[name]` per card via `<CardShell source={...}>` to render the "live | mock | err" badge.

This means **a new card always has a mock value first** — see the workflow in the README "添加新卡片" section. The mock isn't a fallback bolted on, it's the contract.

### Source modules

Each `lib/sources/<name>.ts` owns: env → auth header → query/URL → `fetch` (no-store, with retry) → typed metric slice. They **throw on failure**; the aggregator catches via `settled()`.

Source-specific gotchas (full details in [docs/architecture.md §4](docs/architecture.md)):

- **Sentry** ([lib/sources/sentry.ts](lib/sources/sentry.ts)): requires `sntryu_` User Auth Token, **not** `sntrys_` Org Auth Token. US region uses `us.sentry.io`, but project slug→numeric-ID lookup hits global `sentry.io` and is cached at module scope.
- **Langfuse** ([lib/sources/langfuse.ts](lib/sources/langfuse.ts)): has a **60s in-memory cache** to dodge the free-tier rate limit (3 requests per dashboard load × N users). Single-process only — multi-replica Railway would need Redis. Also contains `MODEL_ALIASES` + `FALLBACK_PRICES` to normalize Mira-side model name drift (`anthropic/claude-sonnet-4.6` vs `claude-sonnet-4-6`) and recompute cost when Langfuse returns `$0`.
- **Railway** ([lib/sources/railway.ts](lib/sources/railway.ts)): env vars are **`RAILWAY_DATASOURCE_*`-prefixed** to avoid clobbering with the `RAILWAY_PROJECT_ID` / `RAILWAY_ENVIRONMENT_ID` that the Railway platform auto-injects pointing at *this* service. The data-source vars point at the **monitored** project (typically mira mainline), not this dashboard's own service.
- **Statuspage** ([lib/sources/statuspage.ts](lib/sources/statuspage.ts)): 6 SaaS status pages, no auth. The `watchedComponents` array filters which sub-components count toward the overall status — see the per-card filter logic in [components/cards/upstream-status.tsx](components/cards/upstream-status.tsx).
- **PostHog** ([lib/sources/posthog.ts](lib/sources/posthog.ts)): uses HogQL via `/api/projects/@current/query/`. Funnels and Retention are still mock — the HogQL queries weren't implemented.
- **Cost** ([lib/cost/read.ts](lib/cost/read.ts) reads, [lib/cost/ingest.ts](lib/cost/ingest.ts) writes): the only source backed by Postgres rather than live API fan-out. Cron sibling service POSTs `/api/ingest/cost` every 30 min during Beijing business hours (8:00 - 23:30, cron `*/30 0-15 * * *` in UTC, 32 runs/day) → 4 providers fan out (`lib/cost/providers/`) → UPSERT into 4 `cost_*_daily` tables (same-day re-runs overwrite via `ON CONFLICT (beijing_date)`) → web service reads on each `/api/metrics`. Schema lives in [lib/db/migrations/](lib/db/migrations/) (numbered `NNN_<name>.sql`, same pattern as mira mainline `apps/mira-work/lib/db/migrate.ts`). `runMigrations()` runs on ingest start AND on first web-service Cost Tab read — `pg_advisory_lock` keeps them from colliding.

### Cost ingest specifics

- **Per-day UPSERT, not append**: `INSERT ... ON CONFLICT (beijing_date) DO UPDATE`. Re-running ingest for the same date overwrites — this is the load-bearing property that makes the 30-min cadence safe (every fire replaces today's row with the latest snapshot). Same mechanism handles backfills via `bun run ingest:cost YYYY-MM-DD` or `POST /api/ingest/cost?date=YYYY-MM-DD`.
- **Railway monthly_estimate is cumulative**: `cost_railway_daily.monthly_estimate_usd` is month-to-date. The 30d trend SQL in [lib/cost/read.ts](lib/cost/read.ts) computes daily Railway cost as `today_mtd - yesterday_mtd` (gated on same-month) with `MTD / day_of_month` fallback — don't change one without the other.
- **Apollo $ is a flat-rate estimate**: Apollo's `/usage_stats` API returns only call counts, no money. We multiply `totalCalls × $0.5` per [reference repo's daily-usage-format.ts:78](https://github.com/...). That constant lives in [lib/cost/providers/apollo.ts](lib/cost/providers/apollo.ts) as `APOLLO_USD_PER_CALL`. **Not tied to actual Apollo plan pricing** — adjust if real per-call rate is known. The schema column is still nullable in case we later decide to drop the estimate, but ingest currently always writes a number.
- **Ingest endpoint is bearer-auth, not Basic Auth**: [middleware.ts](middleware.ts) PUBLIC_PATHS includes `/api/ingest/cost`; the route handler checks `COST_INGEST_TOKEN` separately. If the token isn't set, the endpoint returns 503 (fail-closed).
- **Cron service is a separate Railway service in the same project**, NOT a feature added to the web service. Railway's native cron mode replaces the start command; can't coexist with `next start`. The cron service is a tiny `curlimages/curl` container that just hits the ingest endpoint.

### Migrations

- Pattern matches mira mainline ([apps/mira-work/lib/db/migrate.ts](https://github.com/...) is the source). Numbered `NNN_<slug>.sql` files in [lib/db/migrations/](lib/db/migrations/), tracked via `schema_migrations` table, advisory-locked.
- `lib/db/migrate.ts` is invokable two ways: importable `runMigrations()` (auto-run from app code) and CLI via `bun run db:migrate` (manual). Both share the same module-level "already ran" flag within a single Node process.
- **`.sql` files don't ship in `.next/standalone` by default** — [next.config.ts](next.config.ts) `outputFileTracingIncludes` explicitly lists `lib/db/migrations/**/*.sql` for `/api/ingest/cost` and `/api/metrics` route handlers. **Forgetting to update this when adding new code paths that call `runMigrations()` will cause production "ENOENT migrations/" errors that don't reproduce locally.**
- Paths inside migrate.ts are resolved via `process.cwd()` (works both in standalone runtime and local CLI), NOT `import.meta.url` (which resolves into `.next/server/...` at runtime and breaks).

### Client side

[app/page.tsx](app/page.tsx) → [hooks/use-metrics.ts](hooks/use-metrics.ts) (TanStack Query, polls `/api/metrics` every 10s, no persistence) → tabs in [components/tabs/](components/tabs/) → cards in [components/cards/](components/cards/) all wrapped in [components/cards/card-shell.tsx](components/cards/card-shell.tsx) for consistent badge/title chrome.

`@/*` path alias is configured in [tsconfig.json](tsconfig.json) — use it for cross-module imports.

## Adding a new card

Order matters because of the mock-baseline contract:

1. Add the metric type in [lib/types.ts](lib/types.ts), hanging it on the right tab interface (`HealthTabData` / `BusinessTabData` / `CostTabData`).
2. Add a mock value in [lib/sources/mock.ts](lib/sources/mock.ts) — this is what renders before a real fetch lands and the fallback when fetches fail.
3. (If a new data source) add `lib/sources/<name>.ts` exporting `fetch<Name>()`; throw on failure.
4. Wire it into the `Promise.all` in [lib/sources/index.ts](lib/sources/index.ts) via `settled(...)` and merge into `baseline.<tab>.<field>` on success.
5. Add a component under [components/cards/](components/cards/), wrap in `<CardShell title source={{ name, status: sources[name] }}>`.
6. Mount it inside the relevant `components/tabs/<x>-tab.tsx` grid.

## Deployment

GitHub Actions workflow `Deploy to Railway` ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) is **manually triggered** — push doesn't deploy. The workflow runs `npm run typecheck` + `npm run build` as a gate, then `railway up` using `RAILWAY_DEPLOY_TOKEN` (a Project Token, not the data-source token).

Business env vars (`POSTHOG_*` / `LANGFUSE_*` / `SENTRY_*` / `DASHBOARD_BASIC_AUTH_PASS` / `RAILWAY_DATASOURCE_*`) live on the Railway service Variables, **not** in GitHub Secrets. Only the deploy token is in GH.

## Known data gaps (these are mock, not bugs)

These cards display mock data because the upstream telemetry isn't instrumented yet — full list in [docs/architecture.md §10](docs/architecture.md). Don't "fix" them without instrumenting the source first:

- INP web vital — Mira's `browserTracingIntegration` doesn't have `enableInp`
- LLM provider error rate / task success rate — Langfuse traces aren't tagged with `status`
- Sandbox error card — Sentry events missing `component=sandbox` tag
- OpenAI statuspage — endpoint returns an empty body, light stays `unknown`
- PostHog Funnels + Retention cards — HogQL queries not yet written
