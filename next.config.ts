import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Cost ingest endpoint 在运行时用 readdirSync 读 lib/db/migrations/*.sql 跑迁移,
  // 默认 Next standalone 不拷非 import 的资源 — 用 outputFileTracingIncludes 把 .sql 拷过去
  outputFileTracingIncludes: {
    "/api/ingest/cost": ["./lib/db/migrations/**/*.sql"],
    "/api/metrics": ["./lib/db/migrations/**/*.sql"],
  },
};

export default nextConfig;
