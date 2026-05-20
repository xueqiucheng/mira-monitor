// POST /api/ingest/cost
// 由 Railway sibling cron service 每日 0:30 北京时间触发
// Auth: Authorization: Bearer $COST_INGEST_TOKEN
// 可选 query ?date=YYYY-MM-DD 回填指定日期

import { NextResponse, type NextRequest } from "next/server";
import { runDailyCostIngest } from "@/lib/cost/ingest";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// ingest 最长可能跑十几秒(4 个 provider 并发,Exa 多 key 时更慢),给宽点
export const maxDuration = 60;

const unauthorized = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 });

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const expected = env.cost.ingestToken;
  // 没配 token 直接 503,避免无认证 endpoint 被外网刷
  if (!expected) {
    return NextResponse.json({ error: "ingest token not configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (provided !== expected) return unauthorized();

  const date = req.nextUrl.searchParams.get("date") ?? undefined;

  try {
    const report = await runDailyCostIngest(date);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
};
