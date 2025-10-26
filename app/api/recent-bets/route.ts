import { NextResponse } from "next/server";
import { getRecentTrades } from "@/lib/poly";
import { getSmartWallets, hasNansenKey } from "@/lib/nansen";
import { THRESHOLDS, passesThresholds } from "@/lib/stats";
import { boolEnv, getSmartWalletAllowlist } from "@/lib/env";
import { norm } from "@/lib/util/addr";
import { TTLCache } from "@/lib/cache";
import { computeTraderStats, TraderStats, ProbeNote } from "@/lib/poly-data";

export const revalidate = 0;

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const statsCache = new TTLCache<{ stats: TraderStats; probes: ProbeNote[] }>(60 * 60 * 1000);

const EMPTY_STATS: TraderStats = {
  totalTrades: 0,
  largestWinUSD: 0,
  positionValueUSD: 0,
  realizedPnlUSD: 0,
  winRate: 0,
};

async function mapWithLimit<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const hours = toNumber(searchParams.get("hours"), 24);
  const minBet = toNumber(searchParams.get("minBet"), THRESHOLDS.minBetSizeUSD);
  const debug = searchParams.get("debug") === "1";
  const relax = searchParams.get("relax") === "1";
  const since = Math.floor(Date.now() / 1000) - Math.max(1, hours) * 3600;
  const limitedMode = boolEnv("USE_LIMITED_MODE", false);

  const recentTrades = await getRecentTrades(400);
  const tradesFetched = recentTrades.length;

  let smartWallets = await getSmartWallets();
  const allowlist = getSmartWalletAllowlist();
  if (allowlist.length) {
    const seen = new Set(smartWallets.map((wallet) => wallet.address));
    for (const entry of allowlist) {
      if (!seen.has(entry.address)) {
        smartWallets.push(entry);
        seen.add(entry.address);
      }
    }
  }

  const usedFallback = smartWallets.length === 0;
  if (usedFallback) {
    const derived = new Map<string, string>();
    for (const trade of recentTrades) {
      if (!derived.has(trade.walletLower)) {
        derived.set(trade.walletLower, "Derived • Recent Trader");
      }
      if (derived.size >= 200) {
        break;
      }
    }
    smartWallets = Array.from(derived.entries()).map(([address, label]) => ({ address, label }));
  }

  const labelMap = new Map(smartWallets.map((wallet) => [wallet.address, wallet.label] as const));
  const smartSet = new Set(smartWallets.map((wallet) => wallet.address));
  const requireSmart = !(usedFallback && limitedMode);

  const windowedTrades = recentTrades.filter((trade) => {
    const inTime = trade.timestamp >= since;
    const betOk = trade.sizeUSD > minBet;
    const walletLower = trade.walletLower || norm(trade.wallet);
    const smartOk = requireSmart ? smartSet.has(walletLower) : true;
    return inTime && betOk && smartOk;
  });

  const grouped = new Map<string, typeof windowedTrades>();
  for (const trade of windowedTrades) {
    const key = trade.walletLower || norm(trade.wallet);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(trade);
  }

  const walletKeys = Array.from(grouped.keys());
  const dbgPerWallet: Record<
    string,
    { probes?: ProbeNote[]; cached?: boolean; error?: string }
  > = {};

  const enriched = await mapWithLimit(
    walletKeys,
    6,
    async (wallet) => {
        const cached = statsCache.get(wallet);
        let stats: TraderStats;
        let probes: ProbeNote[] = [];
        let error: string | undefined;
        let cachedFlag = false;

        const holder = { probes: [] as ProbeNote[] };

        if (cached) {
          stats = cached.stats;
          probes = cached.probes;
          cachedFlag = true;
        } else {
          try {
            stats = await computeTraderStats(wallet, holder);
            probes = holder.probes ?? [];
            statsCache.set(wallet, { stats, probes });
          } catch (err: any) {
            stats = { ...EMPTY_STATS };
            probes = holder.probes ?? [];
            error = String(err?.message || err);
          }
        }

        if (!cached && !probes.length) {
          probes = holder.probes ?? [];
        }

        dbgPerWallet[wallet] = { probes, cached: cachedFlag, error };

        const trades = grouped.get(wallet)!;
        const mostRecent = trades.reduce((acc, trade) =>
          trade.timestamp > acc.timestamp ? trade : acc
        );
        const sizePeak = trades.reduce(
          (max, trade) => Math.max(max, trade.sizeUSD),
          0
        );

        return {
          wallet,
          label:
            labelMap.get(wallet) ??
            (usedFallback ? "Derived • Recent Trader" : "Smart • Unknown"),
          outcome: mostRecent.outcome,
          sizeUSD: sizePeak,
          price: mostRecent.price,
          marketId: mostRecent.marketId,
          marketQuestion: mostRecent.marketQuestion,
          marketUrl: mostRecent.marketUrl,
          traderStats: stats,
          timestamp: mostRecent.timestamp,
        };
    }
  );

  const sorted = enriched.slice().sort((a, b) => b.sizeUSD - a.sizeUSD);
  const filtered = relax
    ? sorted
    : sorted.filter((item) => passesThresholds(item.traderStats));
  const items = filtered.slice(0, 50);

  const walletsWithStats = Object.values(dbgPerWallet).filter((entry) => {
    if (entry?.cached) {
      return true;
    }
    if (!entry?.probes) return false;
    return entry.probes.some((probe) => probe.rows > 0);
  }).length;

  const body: Record<string, unknown> = {
    items,
    meta: {
      hours,
      minBet,
      limitedMode,
      usedFallback,
      relax,
      hasNansenKey: hasNansenKey(),
      counts: {
        tradesFetched,
        walletsEnriched: smartWallets.length,
        walletsWithStats,
        afterWindowSmartMinBet: windowedTrades.length,
        afterThresholds: items.length,
      },
    },
  };

  if (debug) {
    (body as any).debug = {
      sampled: enriched.slice(0, 3),
      walletDebug: dbgPerWallet,
    };
  }

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "s-maxage=600, stale-while-revalidate=60",
    },
  });
}
