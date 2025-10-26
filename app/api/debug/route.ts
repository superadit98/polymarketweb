import { NextResponse } from "next/server";
import { hasNansenKey } from "@/lib/nansen";
import { boolEnv, getSmartWalletAllowlist } from "@/lib/env";

export const revalidate = 0;

const POLY_BASE = "https://data-api.polymarket.com";

export async function GET() {
  const allowlist = getSmartWalletAllowlist();
  return NextResponse.json({
    env: {
      NANSEN_API_KEY: hasNansenKey(),
      USE_LIMITED_MODE: boolEnv("USE_LIMITED_MODE", false),
    },
    allowlistCount: allowlist.length,
    effective: {
      polyBase: POLY_BASE,
    },
  });
}
