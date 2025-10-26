import { NextResponse } from "next/server";
import { getWalletTrades } from "@/lib/poly";
import { getSmartWallets } from "@/lib/nansen";
import { computeWinRate } from "@/lib/stats";

export const revalidate = 0;

export async function GET(_req: Request, context: { params: { wallet: string } }) {
  const wallet = context.params.wallet.toLowerCase();
  const [trades, smartWallets] = await Promise.all([
    getWalletTrades(wallet, 500),
    getSmartWallets(),
  ]);

  const label = smartWallets.find((entry) => entry.address === wallet)?.label ?? "Smart Money • Nansen";
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
