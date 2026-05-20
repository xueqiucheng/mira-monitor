-- =============================================
-- Cost 监控初始 schema:4 张 daily 快照表
-- 每个 provider 一张表,ingest 每天 UPSERT 一行(主键 beijing_date)
-- JSONB 装明细数组(top_models / breakdown / projects / endpoints)
-- =============================================

CREATE TABLE IF NOT EXISTS cost_ai_gateway_daily (
  beijing_date           DATE PRIMARY KEY,
  cost_usd               NUMERIC(12,4) NOT NULL,
  balance_usd            NUMERIC(12,4) NOT NULL,
  request_count          BIGINT NOT NULL,
  input_tokens           BIGINT NOT NULL,
  output_tokens          BIGINT NOT NULL,
  cached_input_tokens    BIGINT NOT NULL,
  cache_creation_tokens  BIGINT NOT NULL,
  top_models             JSONB  NOT NULL,
  collected_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_exa_daily (
  beijing_date  DATE PRIMARY KEY,
  cost_usd      NUMERIC(12,4) NOT NULL,
  breakdown     JSONB NOT NULL,
  collected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_railway_daily (
  beijing_date          DATE PRIMARY KEY,
  monthly_estimate_usd  NUMERIC(12,4) NOT NULL,
  projects              JSONB NOT NULL,
  collected_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_apollo_daily (
  beijing_date        DATE PRIMARY KEY,
  estimated_cost_usd  NUMERIC(12,4),
  endpoints           JSONB NOT NULL,
  collected_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
