import { NextResponse } from "next/server";
import { getRecentTrades, type Trade } from "@/lib/poly";
import { getSmartWallets } from "@/lib/nansen";
import { THRESHOLDS, aggregateStats, passesThresholds } from "@/lib/stats";

export const revalidate = 0;

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const hours = toNumber(searchParams.get("hours"), 24);
  const minBet = toNumber(searchParams.get("minBet"), THRESHOLDS.minBetSizeUSD);

  const since = Math.floor(Date.now() / 1000) - Math.max(1, hours) * 3600;

  const [recentTrades, smartWallets] = await Promise.all([
    getRecentTrades(200),
    getSmartWallets(),
  ]);

  const smartSet = new Set(smartWallets.map((wallet) => wallet.address));
  const labelMap = new Map(smartWallets.map((wallet) => [wallet.address, wallet.label] as const));

  const filteredTrades = recentTrades.filter((trade) =>
    trade.timestamp >= since &&
    trade.sizeUSD > minBet &&
    smartSet.has(trade.wallet)
  );

  const grouped = new Map<string, Trade[]>();
  for (const trade of filteredTrades) {
    if (!grouped.has(trade.wallet)) {
      grouped.set(trade.wallet, []);
    }
    grouped.get(trade.wallet)!.push(trade);
  }

  const items = Array.from(grouped.entries())
    .map(([wallet, trades]) => {
      const stats = aggregateStats(trades);
      const sortedTrades = [...trades].sort((a, b) => b.sizeUSD - a.sizeUSD);
      const timestamps = trades.map((trade) => trade.timestamp);
      const latestTs = timestamps.length ? Math.max(...timestamps) : Math.floor(Date.now() / 1000);
      const primary = sortedTrades[0];

      return {
        wallet,
        label: labelMap.get(wallet) ?? "Smart Money • Nansen",
        outcome: primary?.outcome ?? "YES",
        sizeUSD: primary?.sizeUSD ?? 0,
        price: primary?.price ?? 0,
        marketId: primary?.marketId ?? "",
        marketQuestion: primary?.marketQuestion ?? "",
        marketUrl: primary?.marketUrl ?? "https://polymarket.com",
        traderStats: stats,
        timestamp: latestTs,
      };
    })
    .filter((item) => passesThresholds(item.traderStats))
    .sort((a, b) => b.sizeUSD - a.sizeUSD)
    .slice(0, 50);

  return NextResponse.json(
    {
      items,
      meta: {
        hours,
        minBet,
        counts: {
          tradesFetched: recentTrades.length,
          walletsEnriched: smartWallets.length,
          afterWindowSmartMinBet: filteredTrades.length,
          afterThresholds: items.length,
        },
      },
    },
    {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=60",
      },
    }
  );
}
