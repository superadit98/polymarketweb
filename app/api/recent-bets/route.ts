import { NextResponse } from "next/server";
import { getRecentTrades } from "@/lib/poly";
import type { Trade } from "@/lib/poly";
import { getSmartWallets, hasNansenKey } from "@/lib/nansen";
import { THRESHOLDS, passesThresholds } from "@/lib/stats";
import { boolEnv, getSmartWalletAllowlist } from "@/lib/env";
import { norm } from "@/lib/util/addr";
import { TTLCache } from "@/lib/cache";
import { computeTraderStats, TraderStats as PolyTraderStats, ProbeNote } from "@/lib/poly-data";
import type { RecentBet, TraderStats as PublicTraderStats } from "@/types";

const RELAX_FALLBACK = (process.env.ALLOW_TRADES_ONLY ?? "1") === "1";

function isTradesOnly(stats: PublicTraderStats | { [key: string]: unknown } | null | undefined): boolean {
  if (!stats) return false;
  const totalTrades = Number((stats as PublicTraderStats).totalTrades ?? 0);
  const largestWinUSD = Number((stats as PublicTraderStats).largestWinUSD ?? 0);
  const positionValueUSD = Number((stats as PublicTraderStats).positionValueUSD ?? 0);
  const realizedPnlUSD = Number((stats as PublicTraderStats).realizedPnlUSD ?? 0);
  const winRate = Number((stats as PublicTraderStats).winRate ?? 0);
  return totalTrades > 0 && largestWinUSD === 0 && positionValueUSD === 0 && realizedPnlUSD === 0 && winRate === 0;
}

export const revalidate = 0;

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const statsCache = new TTLCache<{ stats: PolyTraderStats; probes: ProbeNote[] }>(60 * 60 * 1000);

const EMPTY_STATS: PolyTraderStats = {
  totalTrades: 0,
  largestWinUSD: null,
  positionValueUSD: null,
  realizedPnlUSD: null,
  winRate: null,
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

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const SORT_FIELDS = ["sizeUSD", "timestamp", "label", "distinctMarkets", "betsCount"] as const;
type SortField = (typeof SORT_FIELDS)[number];
type SortDir = "asc" | "desc";

function parseSortBy(value: string | null): SortField {
  if (value && SORT_FIELDS.includes(value as SortField)) {
    return value as SortField;
  }
  return "sizeUSD";
}

function parseSortDir(value: string | null): SortDir {
  return value === "asc" ? "asc" : "desc";
}

function normalizeStats(stats: PolyTraderStats, trades: Trade[]): PublicTraderStats {
  const totalTrades = stats?.totalTrades && stats.totalTrades > 0 ? stats.totalTrades : trades.length;
  return {
    totalTrades,
    largestWinUSD: stats?.largestWinUSD ?? null,
    positionValueUSD: stats?.positionValueUSD ?? null,
    realizedPnlUSD: stats?.realizedPnlUSD ?? null,
    winRate: stats?.winRate ?? null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const hours = Math.max(1, toInt(searchParams.get("hours"), 24));
  const minBet = Math.max(0, toNumber(searchParams.get("minBet"), THRESHOLDS.minBetSizeUSD));
  const debug = searchParams.get("debug") === "1";
  const relaxParam = searchParams.get("relax") === "1";
  const relax = relaxParam || RELAX_FALLBACK;
  const labelsFilter = parseCsv(searchParams.get("labels")).map((entry) => entry.toLowerCase());
  const outcomesParam = parseCsv(searchParams.get("outcome"));
  const outcomes = outcomesParam.length
    ? Array.from(
        new Set(
          outcomesParam.map((value) => (String(value).toUpperCase() === "NO" ? "NO" : "YES"))
        )
      )
    : ["YES", "NO"];
  const sortBy = parseSortBy(searchParams.get("sortBy"));
  const sortDir = parseSortDir(searchParams.get("sortDir"));
  const activeWithinDays = Math.max(0, toInt(searchParams.get("activeWithinDays"), 0));
  const distinctMarketsMin = Math.max(0, toInt(searchParams.get("distinctMarketsMin"), 0));
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
    const betOk = trade.sizeUSD >= minBet;
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
      let stats: PolyTraderStats;
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
      const mostRecent = trades.reduce((acc, trade) => (trade.timestamp > acc.timestamp ? trade : acc));
      const sizePeak = trades.reduce((max, trade) => Math.max(max, trade.sizeUSD), 0);
      const distinctMarkets = new Set(trades.map((trade) => trade.marketId)).size;
      const betsCount = trades.length;
      const publicStats = normalizeStats(stats, trades);

      const label =
        labelMap.get(wallet) ?? (usedFallback ? "Derived • Recent Trader" : "Smart • Unknown");

      const payload: RecentBet = {
        wallet,
        label,
        outcome: mostRecent.outcome,
        sizeUSD: sizePeak,
        price: mostRecent.price,
        marketId: mostRecent.marketId,
        marketQuestion: mostRecent.marketQuestion,
        marketUrl: mostRecent.marketUrl,
        traderStats: publicStats,
        timestamp: mostRecent.timestamp,
        distinctMarkets,
        betsCount,
      };

      return payload;
    }
  );

  let tradesOnlyCount = 0;
  const thresholdFiltered = enriched.filter((item) => {
    if (relax && isTradesOnly(item.traderStats)) {
      tradesOnlyCount += 1;
      return true;
    }
    return passesThresholds(item.traderStats);
  });

  const labelSet = new Set(labelsFilter);
  const outcomeSet = new Set(outcomes as ("YES" | "NO")[]);

  const labelFiltered = thresholdFiltered.filter((item) => {
    const labelLower = item.label.toLowerCase();
    if (labelLower.includes("derived")) {
      return false;
    }
    if (!labelSet.size) {
      return true;
    }
    return (
      (labelSet.has("smart_money") && labelLower.includes("smart money")) ||
      (labelSet.has("smart_trader") && labelLower.includes("smart trader")) ||
      (labelSet.has("whale") && labelLower.includes("whale"))
    );
  });

  let filtered: RecentBet[] = labelFiltered.filter((item) => outcomeSet.has(item.outcome));
  filtered = filtered.filter((item) => item.sizeUSD >= minBet);

  if (activeWithinDays > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - activeWithinDays * 86400;
    filtered = filtered.filter((item) => item.timestamp >= cutoff);
  }

  if (distinctMarketsMin > 0) {
    filtered = filtered.filter((item) => (item.distinctMarkets ?? 0) >= distinctMarketsMin);
  }

  const totalAfterFilter = filtered.length;

  const direction = sortDir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const compare = (x: number, y: number) => (x < y ? -1 : x > y ? 1 : 0) * direction;
    switch (sortBy) {
      case "timestamp":
        return compare(a.timestamp, b.timestamp);
      case "label":
        return a.label.localeCompare(b.label) * direction;
      case "distinctMarkets":
        return compare(a.distinctMarkets ?? 0, b.distinctMarkets ?? 0);
      case "betsCount":
        return compare(a.betsCount ?? 0, b.betsCount ?? 0);
      case "sizeUSD":
      default:
        return compare(a.sizeUSD, b.sizeUSD);
    }
  });

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
      limitedMode: limitedMode || relax,
      usedFallback,
      relax,
      hasNansenKey: hasNansenKey(),
      counts: {
        tradesFetched,
        walletsEnriched: smartWallets.length,
        walletsWithStats,
        afterWindowSmartMinBet: windowedTrades.length,
        afterThresholds: thresholdFiltered.length,
        totalAfterFilter,
        walletsTradesOnly: tradesOnlyCount,
      },
      applied: {
        labels: labelsFilter,
        outcomes,
        sortBy,
        sortDir,
        activeWithinDays,
        distinctMarketsMin,
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
