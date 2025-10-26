import { NextResponse } from "next/server";
import { getRecentTrades } from "@/lib/poly";

export const revalidate = 0;

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = toNumber(searchParams.get("limit"), 100);
  const trades = await getRecentTrades(Math.min(Math.max(limit, 1), 500));

  return NextResponse.json({
    ok: trades.length > 0,
    count: trades.length,
    sample: trades.slice(0, 3),
    url: "https://data-api.polymarket.com/trades",
  });
}
