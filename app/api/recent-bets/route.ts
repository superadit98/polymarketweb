import { NextResponse } from "next/server";
import { getRecentTrades } from "@/lib/poly";
import { getSmartWallets } from "@/lib/nansen";
import { THRESHOLDS, aggregateStats, passesThresholds } from "@/lib/stats";
import { boolEnv, getSmartWalletAllowlist } from "@/lib/env";

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
  const limited = boolEnv("USE_LIMITED_MODE", false);

  const recentTrades = await getRecentTrades(400);

  let smartWallets = await getSmartWallets();

  const allowlist = getSmartWalletAllowlist();
  if (allowlist.length) {
    const existing = new Set(smartWallets.map((wallet) => wallet.address));
    for (const entry of allowlist) {
      if (!existing.has(entry.address)) {
        smartWallets.push(entry);
      }
    }
  }

  if (smartWallets.length === 0) {
    const derived = new Map<string, string>();
    for (const trade of recentTrades) {
      if (!derived.has(trade.wallet)) {
        derived.set(trade.wallet, "Derived • Recent Trader");
      }
      if (derived.size >= 200) {
        break;
      }
    }
    smartWallets = Array.from(derived.entries()).map(([address, label]) => ({ address, label }));
  }

  const smartSet = new Set(smartWallets.map((wallet) => wallet.address));
  const labelMap = new Map(smartWallets.map((wallet) => [wallet.address, wallet.label] as const));

  const filteredTrades = recentTrades.filter(
    (trade) => trade.timestamp >= since && trade.sizeUSD > minBet && smartSet.has(trade.wallet)
  );

  const grouped = new Map<string, typeof filteredTrades>();
  for (const trade of filteredTrades) {
    if (!grouped.has(trade.wallet)) {
      grouped.set(trade.wallet, []);
    }
    grouped.get(trade.wallet)!.push(trade);
  }

  const items = Array.from(grouped.entries())
    .map(([wallet, trades]) => {
      const stats = aggregateStats(trades);
      const latest = trades.reduce((acc, trade) => (trade.timestamp > acc.timestamp ? trade : acc), trades[0]);
      const largestSize = trades.reduce((max, trade) => Math.max(max, trade.sizeUSD), 0);

      return {
        wallet,
        label: labelMap.get(wallet) ?? "Smart • Unknown",
        outcome: latest?.outcome ?? "YES",
        sizeUSD: largestSize,
        price: latest?.price ?? 0,
        marketId: latest?.marketId ?? "",
        marketQuestion: latest?.marketQuestion ?? "",
        marketUrl: latest?.marketUrl ?? "https://polymarket.com",
        traderStats: stats,
        timestamp: latest?.timestamp ?? Math.floor(Date.now() / 1000),
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
        limitedMode: limited,
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
        "Cache-Control": "s-maxage=900, stale-while-revalidate=60",
      },
    }
  );
}
