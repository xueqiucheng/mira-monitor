// 数据库迁移 runner (跟 mira 主站 apps/mira-work/lib/db/migrate.ts 同款)
//
// 跑法 1: 应用启动时 runMigrations() — ingest cron 第一步、web 服务首次读 Cost Tab 时
// 跑法 2: 手动 CLI — `npm run db:migrate` (复用 scripts/migrate-cli.ts entrypoint)
//
// 设计点:
//   - pg_advisory_lock 防止 cron 跟 web 同时跑 migration 互相打架
//   - 000_schema_migrations.sql 是 bootstrap (建跟踪表),先于其他 migration 跑
//   - 每个 migration 包一个事务 + INSERT 到 schema_migrations,失败 ROLLBACK
//   - 文件路径相对 process.cwd():本地 = repo 根,prod = .next/standalone(靠 next.config 拷过去)

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./postgres";

const MIGRATE_LOCK_KEY = 0x6d697261; // "mira" in hex,跟主站同一把锁的命名思路(独立 DB 不会冲突)
const BOOTSTRAP_FILE = "000_schema_migrations.sql";
const MIGRATIONS_RELATIVE_PATH = "lib/db/migrations";

let migrationsRan = false;

const migrationsDir = (): string => join(process.cwd(), MIGRATIONS_RELATIVE_PATH);

const readMigration = (file: string): string =>
  readFileSync(join(migrationsDir(), file), "utf-8");

/**
 * 跑所有待执行的 migration (按文件名升序,跳过 schema_migrations 里已记录的)。
 * 进程内自带 module-level flag,每个 Node 进程只跑一次。
 *
 * 失败抛错,调用方 (ingest endpoint / read path) 决定怎么处理。
 */
export const runMigrations = async (options: { verbose?: boolean } = {}): Promise<void> => {
  if (migrationsRan) return;
  const log = options.verbose ? console.log : () => {};

  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATE_LOCK_KEY]);

    // Bootstrap: 建跟踪表 (跟踪表自身也算 migration 000,记录进自己)
    await client.query(readMigration(BOOTSTRAP_FILE));
    await client.query(
      "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      [BOOTSTRAP_FILE],
    );

    const { rows: appliedRows } = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    const applied = new Set(appliedRows.map((r) => r.name));

    const allFiles = readdirSync(migrationsDir())
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      log("✅ migrations up-to-date");
      migrationsRan = true;
      return;
    }

    log(`🔄 pending migrations: ${pending.length}`);
    for (const file of pending) {
      log(`   running ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(readMigration(file));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        log(`   ✅ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    migrationsRan = true;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATE_LOCK_KEY]);
    client.release();
  }
};
