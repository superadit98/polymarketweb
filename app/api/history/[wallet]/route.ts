import { NextResponse } from "next/server";
import { getSmartWallets } from "@/lib/nansen";
import { getSmartWalletAllowlist } from "@/lib/env";
import { fetchClosedTrades, computeTraderStats, ProbeNote } from "@/lib/poly-data";

export const revalidate = 0;

export async function GET(req: Request, context: { params: { wallet: string } }) {
  const wallet = context.params.wallet.toLowerCase();
  const debug = new URL(req.url).searchParams.get("debug") === "1";

  const closedProbes: ProbeNote[] = [];
  const statsDbg = { probes: [] as ProbeNote[] };

  const [closedTrades, smartWallets, stats] = await Promise.all([
    fetchClosedTrades(wallet, closedProbes),
    getSmartWallets(),
    computeTraderStats(wallet, statsDbg),
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

  return NextResponse.json(
    {
      wallet,
      label,
      winRate: stats.winRate,
      rows: closedTrades.map((trade) => ({
        marketId: trade.marketId,
        marketQuestion: trade.marketQuestion ?? "Unknown market",
        outcome: trade.outcome,
        sizeUSD: trade.sizeUSD,
        price: trade.price,
        result: trade.pnlUSD > 0 ? "Win" : trade.pnlUSD < 0 ? "Loss" : "Pending",
        pnlUSD: trade.pnlUSD,
        marketUrl: trade.marketUrl ?? "https://polymarket.com",
        closedAt: trade.closedAt,
      })),
      traderStats: stats,
      ...(debug
        ? {
            debug: {
              closedProbes,
              statsProbes: statsDbg.probes,
            },
          }
        : {}),
    },
    {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=60",
      },
    }
  );
}
