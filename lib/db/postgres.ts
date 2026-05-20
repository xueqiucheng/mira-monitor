import { Pool } from "pg";

let pool: Pool | null = null;

const connectionString = (): string | null => {
  const v = process.env.DATABASE_URL?.trim();
  return v && v !== "" ? v : null;
};

export const isPostgresConfigured = (): boolean => connectionString() !== null;

export const getPool = (): Pool => {
  if (pool) return pool;
  const url = connectionString();
  if (!url) throw new Error("DATABASE_URL not configured");
  pool = new Pool({
    connectionString: url,
    // Railway 内网默认 sslmode=require,pg 自动处理;留 ssl undefined 让 libpq 走 URL
    max: 4,
    idleTimeoutMillis: 30_000,
  });
  return pool;
};
