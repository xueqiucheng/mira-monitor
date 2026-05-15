import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = (): NextResponse =>
  NextResponse.json({ ok: true, ts: new Date().toISOString() });
