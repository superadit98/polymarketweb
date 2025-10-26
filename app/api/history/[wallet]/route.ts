import { NextResponse } from "next/server";
import { getWalletTrades } from "@/lib/poly";
import { getSmartWallets } from "@/lib/nansen";
import { computeWinRate } from "@/lib/stats";
import { getSmartWalletAllowlist } from "@/lib/env";

export const revalidate = 0;

export async function GET(_req: Request, context: { params: { wallet: string } }) {
  const wallet = context.params.wallet.toLowerCase();
  const [trades, smartWallets] = await Promise.all([
    getWalletTrades(wallet, 500),
    getSmartWallets(),
  ]);

  const allowlist = getSmartWalletAllowlist();
  const combined = [...smartWallets];
  const seen = new Set(combined.map((entry) => entry.address));
  for (const entry of allowlist) {
    if (!seen.has(entry.address)) {
      combined.push(entry);
      seen.add(entry.address);
    }
  }

  const label =
    combined.find((entry) => entry.address === wallet)?.label ??
    (smartWallets.length === 0 ? "Derived • Trader" : "Smart Money • Nansen");
  const winRate = computeWinRate(trades);

  return NextResponse.json(
    {
      wallet,
      label,
      winRate,
      rows: trades.map((trade) => ({
        marketId: trade.marketId,
        marketQuestion: trade.marketQuestion,
        outcome: trade.outcome,
        sizeUSD: trade.sizeUSD,
        price: trade.price,
        result: trade.result ?? "Pending",
        pnlUSD: trade.pnlUSD ?? 0,
        marketUrl: trade.marketUrl,
        closedAt: undefined,
      })),
    },
    {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=60",
      },
    }
  );
}
