import { NextResponse } from "next/server";
import { hasNansenKey } from "@/lib/nansen";

export const revalidate = 0;

const POLY_BASE = "https://data-api.polymarket.com";

export async function GET() {
  return NextResponse.json({
    env: {
      NANSEN_API_KEY: hasNansenKey(),
    },
    effective: {
      polyBase: POLY_BASE,
      mockMode: false,
    },
  });
}
