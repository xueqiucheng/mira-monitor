-- =============================================
-- 迁移执行记录表(必须最先执行,由 migrate.ts 引导)
-- 用于记录已执行的迁移文件名,实现增量迁移
-- 跟 mira 主站 (apps/mira-work/lib/db/migrations/000_schema_migrations.sql) 同款
-- =============================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(255) NOT NULL PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT (now())
);

COMMENT ON TABLE schema_migrations IS '数据库迁移执行记录,仅追加不修改';
COMMENT ON COLUMN schema_migrations.name IS '迁移文件名,如 001_cost_tables.sql';
COMMENT ON COLUMN schema_migrations.executed_at IS '执行完成时间';
