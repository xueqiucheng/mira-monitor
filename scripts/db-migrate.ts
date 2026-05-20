// 手动跑 migrations — 跟 mira 主站 `pnpm db:migrate` 同款入口
// 用法: bun run db:migrate  (或 npm run db:migrate)
//
// 通常不需要手动跑:ingest cron 启动时 + web 首次读 Cost Tab 都会自动 runMigrations()
// 手动跑的场景:本地连远端 DB 排查 / 新 DB 一次性初始化 / 加新 migration 后想立即验证

import { runMigrations } from "../lib/db/migrate";

const main = async (): Promise<void> => {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }
  await runMigrations({ verbose: true });
  process.exit(0);
};

main().catch((e) => {
  console.error("❌ migrate failed:", e);
  process.exit(1);
});
