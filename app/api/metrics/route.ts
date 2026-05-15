import { NextResponse } from "next/server";
import { fetchMetrics } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = async (): Promise<NextResponse> => {
  try {
    const data = await fetchMetrics();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
};
