import type { NextApiRequest, NextApiResponse } from "next";
import {
  buildRecentBet,
  deriveApproximateStats,
  fetchMarketsBySlugs,
  fetchRecentTrades,
  fetchTraderStats,
  hasClobAccess,
  tradeValueUSD,
  type Trade,
} from "@/lib/poly";
import type { RecentBetsResponse, TraderStats } from "@/types";

const THRESHOLDS = {
  minTotalTrades: 1000,
  minLargestWinUSD: 10_000,
  minPositionValueUSD: 40_000,
  minRealizedPnlUSD: 50_000,
  minBetUSD: 100,
  minWinRate: 50,
};

const DEFAULT_HOURS = 24;

function clampNumber(value: unknown, fallback: number, bounds: { min: number; max: number }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

type WalletBucket = {
  wallet: string;
  label: string;
  trades: Trade[];
  stats: TraderStats | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debug = String(req.query.debug ?? "") === "1";
  const minBet = clampNumber(req.query.minBet, THRESHOLDS.minBetUSD, { min: 0, max: 1_000_000 });
  const limit = clampNumber(req.query.limit, 200, { min: 1, max: 500 });
  const hours = clampNumber(req.query.hours, DEFAULT_HOURS, { min: 1, max: 24 * 30 });
  const since = Math.max(0, Math.floor(Date.now() / 1000 - hours * 3600));

  try {
    const trades = await fetchRecentTrades(limit);
    const timeFiltered = trades.filter((trade) => trade.timestamp >= since);
    const minBetFiltered = timeFiltered.filter((trade) => tradeValueUSD(trade) >= minBet);

    const slugs = minBetFiltered
      .map((trade) => trade.slug || trade.market_slug || trade.market?.slug)
      .filter((slug): slug is string => Boolean(slug));
    const markets = await fetchMarketsBySlugs(slugs);

    const strictMode = hasClobAccess();

    const buckets = new Map<string, WalletBucket>();
    for (const trade of minBetFiltered) {
      const wallet = trade.proxyWallet;
      if (!wallet) continue;
      if (!buckets.has(wallet)) {
        buckets.set(wallet, {
          wallet,
          label: String(trade.pseudonym ?? "Smart Trader"),
          trades: [],
          stats: null,
        });
      }
      buckets.get(wallet)!.trades.push(trade);
    }

    const walletBuckets = Array.from(buckets.values());

    if (strictMode) {
      await Promise.all(
        walletBuckets.map(async (bucket) => {
          bucket.stats = await fetchTraderStats(bucket.wallet);
        })
      );
    } else {
      for (const bucket of walletBuckets) {
        bucket.stats = deriveApproximateStats(bucket.trades, markets);
      }
    }

    const filteredBuckets = walletBuckets.filter((bucket) => {
      const stats = bucket.stats;
      if (!stats) return false;
      if (!strictMode) {
        return true;
      }
      return (
        stats.totalTrades > THRESHOLDS.minTotalTrades &&
        stats.largestWinUSD > THRESHOLDS.minLargestWinUSD &&
        stats.positionValueUSD > THRESHOLDS.minPositionValueUSD &&
        stats.realizedPnlUSD > THRESHOLDS.minRealizedPnlUSD &&
        stats.winRate >= THRESHOLDS.minWinRate
      );
    });

    const items = filteredBuckets
      .flatMap((bucket) =>
        bucket.trades.map((trade) => buildRecentBet(trade, bucket.stats!, markets, bucket.label))
      )
      .filter((bet) => bet.sizeUSD >= minBet)
      .sort((a, b) => b.sizeUSD - a.sizeUSD)
      .slice(0, 50);

    const payload: RecentBetsResponse = {
      items,
      meta: {
        mode: strictMode ? "strict" : "approximate",
        counts: {
          fetched: trades.length,
          timeFiltered: timeFiltered.length,
          minBet: minBetFiltered.length,
          wallets: filteredBuckets.length,
          items: items.length,
        },
      },
    } as RecentBetsResponse;

    if (!debug) {
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    }

    res.status(200).json(debug ? payload : { items });
  } catch (error: any) {
    console.error("[recent-bets] error", error);
    res.status(500).json({ error: String(error?.message || error) });
  }
}
