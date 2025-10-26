import { getPolyUrl } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import type {
  ClosedTrade,
  Outcome,
  RecentBet,
  TraderStats,
  TraderStatsEnvelope,
  WalletHistory,
} from "@/types";

const DEFAULT_LIMIT = 200;
const DEFAULT_CONCURRENCY = 5;

export const THRESHOLDS = {
  minTotalTrades: 1000,
  minLargestWinUSD: 10_000,
  minPositionValueUSD: 40_000,
  minRealizedPnlUSD: 50_000,
  minBetSizeUSD: 500,
} as const;

export function meetsTraderThresholds(stats: TraderStats | null | undefined): boolean {
  if (!stats) return false;
  return (
    stats.totalTrades > THRESHOLDS.minTotalTrades &&
    stats.largestWinUSD > THRESHOLDS.minLargestWinUSD &&
    stats.positionValueUSD > THRESHOLDS.minPositionValueUSD &&
    stats.realizedPnlUSD > THRESHOLDS.minRealizedPnlUSD
  );
}

type FetchParams = Record<string, string | number | undefined>;

interface TradeRecord {
  id: string;
  wallet: string;
  marketId: string;
  marketQuestion: string;
  marketSlug?: string;
  outcome: Outcome;
  sizeUSD: number;
  price: number;
  timestamp: number;
  raw: Record<string, any>;
}

interface TradesResponse {
  trades: any[];
  total?: number;
}

interface PositionsResponse {
  positions: any[];
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }
  return fallback;
}

function normalizeOutcome(value: unknown): Outcome {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "YES" || raw === "NO") {
    return raw as Outcome;
  }
  if (raw === "BUY") return "YES";
  if (raw === "SELL") return "NO";
  return "YES";
}

function buildMarketUrl(slug?: string | null, id?: string | null): string {
  const safeSlug = slug?.trim();
  if (safeSlug) {
    return `https://polymarket.com/event/${safeSlug}`;
  }
  const safeId = id?.trim();
  if (safeId) {
    return `https://polymarket.com/event/${safeId}`;
  }
  return "https://polymarket.com/markets";
}

async function polymarketFetch<T = any>(path: string, params: FetchParams = {}): Promise<T> {
  const base = getPolyUrl().replace(/\/$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? "" : "/"}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return fetchJson<T>(url.toString(), { timeoutMs: 12_000 });
}

function mapTrade(record: any): TradeRecord | null {
  if (!record) return null;
  const wallet = (record.user || record.maker || record.taker || record.trader || "").toString();
  if (!wallet) return null;
  const sizeUSD = parseNumber(record.amount_usd ?? record.cost_usd ?? record.value_usd ?? record.amount ?? record.collateral);
  const price = parseNumber(record.price);
  const timestamp = record.created_time
    ? Math.floor(new Date(record.created_time).getTime() / 1000)
    : record.timestamp
    ? parseNumber(record.timestamp)
    : 0;
  const marketId = (record.market_id || record.marketId || record.market?.id || "").toString();
  const marketQuestion =
    (record.market_question || record.marketQuestion || record.market?.question || "Unknown market").toString();
  if (!marketId) return null;
  if (!Number.isFinite(sizeUSD) || sizeUSD <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return {
    id: (record.id || `${wallet}-${timestamp}` || "").toString(),
    wallet: wallet.toLowerCase(),
    marketId,
    marketQuestion,
    marketSlug: record.market_slug || record.market?.slug,
    outcome: normalizeOutcome(record.outcome ?? record.side ?? record.action),
    sizeUSD,
    price,
    timestamp,
    raw: record,
  };
}

export async function fetchRecentTrades(limit = DEFAULT_LIMIT): Promise<TradeRecord[]> {
  const data = await polymarketFetch<TradesResponse>("/trades", { limit });
  const trades = Array.isArray(data?.trades) ? data.trades : [];
  return trades
    .map((trade) => mapTrade(trade))
    .filter((trade): trade is TradeRecord => Boolean(trade));
}

async function fetchWalletTrades(wallet: string, limit = 500): Promise<TradeRecord[]> {
  const data = await polymarketFetch<TradesResponse>("/trades", { user: wallet, limit });
  const trades = Array.isArray(data?.trades) ? data.trades : [];
  return trades
    .map((trade) => mapTrade(trade))
    .filter((trade): trade is TradeRecord => Boolean(trade));
}

async function fetchWalletPositions(wallet: string, limit = 500): Promise<any[]> {
  const data = await polymarketFetch<PositionsResponse>("/positions", { user: wallet, limit });
  return Array.isArray(data?.positions) ? data.positions : [];
}

function computeClosedTrades(trades: TradeRecord[]): ClosedTrade[] {
  return trades.map((trade) => {
    const pnlUSD = parseNumber(
      trade.raw?.realized_pnl_usd ??
        trade.raw?.realized_pnl ??
        trade.raw?.pnl_usd ??
        trade.raw?.payout_usd ??
        0,
    );
    const closedAtRaw = trade.raw?.updated_time ?? trade.raw?.closed_time;
    const closedAt = closedAtRaw ? Math.floor(new Date(closedAtRaw).getTime() / 1000) : undefined;
    const result = pnlUSD > 0 ? "Win" : pnlUSD < 0 ? "Loss" : "Pending";
    return {
      marketId: trade.marketId,
      marketQuestion: trade.marketQuestion,
      outcome: trade.outcome,
      sizeUSD: trade.sizeUSD,
      price: trade.price,
      pnlUSD,
      result,
      marketUrl: buildMarketUrl(trade.marketSlug, trade.marketId),
      closedAt: closedAt ?? trade.timestamp,
    };
  });
}

function computeWinRate(closed: ClosedTrade[]): number {
  const wins = closed.filter((trade) => trade.result === "Win").length;
  const losses = closed.filter((trade) => trade.result === "Loss").length;
  if (wins + losses === 0) return 0;
  return wins / (wins + losses);
}

async function fetchTraderStats(wallet: string): Promise<TraderStatsEnvelope | null> {
  try {
    const [trades, positions] = await Promise.all([fetchWalletTrades(wallet), fetchWalletPositions(wallet)]);
    if (!trades.length) {
      return null;
    }
    const closed = computeClosedTrades(trades);
    const realizedPnlUSD = closed.reduce((sum, trade) => sum + trade.pnlUSD, 0);
    const largestWinUSD = closed.reduce((max, trade) => (trade.pnlUSD > max ? trade.pnlUSD : max), 0);
    const positionValueUSD = positions.reduce(
      (sum, position) => sum + parseNumber(position.value_usd ?? position.usd_value ?? position.total_usd ?? position.valuation_usd),
      0,
    );
    const totalTrades = trades.length;
    const winRate = computeWinRate(closed);

    const stats: TraderStats = {
      totalTrades,
      largestWinUSD,
      positionValueUSD,
      realizedPnlUSD,
      winRate,
    };

    return {
      ...stats,
      closed,
    };
  } catch (error) {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchRecentBets(limit = DEFAULT_LIMIT): Promise<{ trades: TradeRecord[]; stats: Map<string, TraderStatsEnvelope> }> {
  const trades = await fetchRecentTrades(limit);
  const wallets = Array.from(new Set(trades.map((trade) => trade.wallet)));
  const statsEntries = await mapWithConcurrency(wallets, DEFAULT_CONCURRENCY, async (wallet) => {
    const stats = await fetchTraderStats(wallet);
    return [wallet, stats] as const;
  });
  const statsMap = new Map<string, TraderStatsEnvelope>();
  for (const [wallet, stats] of statsEntries) {
    if (stats) {
      statsMap.set(wallet, stats);
    }
  }
  return { trades, stats: statsMap };
}

export function filterSmartTraders(bets: RecentBet[], minBet: number = THRESHOLDS.minBetSizeUSD): RecentBet[] {
  const threshold = Math.max(minBet, THRESHOLDS.minBetSizeUSD);
  const filtered = bets.filter((bet) => meetsTraderThresholds(bet.traderStats) && bet.sizeUSD >= threshold);

  return filtered.sort((a, b) => b.sizeUSD - a.sizeUSD).slice(0, 50);
}

export function attachStatsToTrades(
  trades: TradeRecord[],
  stats: Map<string, TraderStatsEnvelope>,
  since?: number,
): RecentBet[] {
  return trades
    .filter((trade) => (since ? trade.timestamp >= since : true))
    .map((trade) => {
      const statsForWallet = stats.get(trade.wallet);
      if (!statsForWallet) return null;
      const traderStats: TraderStats = {
        totalTrades: statsForWallet.totalTrades,
        largestWinUSD: statsForWallet.largestWinUSD,
        positionValueUSD: statsForWallet.positionValueUSD,
        realizedPnlUSD: statsForWallet.realizedPnlUSD,
        winRate: statsForWallet.winRate,
      };
      return {
        wallet: trade.wallet,
        label: "Smart Trader",
        outcome: trade.outcome,
        sizeUSD: trade.sizeUSD,
        price: trade.price,
        marketId: trade.marketId,
        marketQuestion: trade.marketQuestion,
        marketUrl: buildMarketUrl(trade.marketSlug, trade.marketId),
        traderStats,
        timestamp: trade.timestamp,
      } satisfies RecentBet;
    })
    .filter((bet): bet is RecentBet => Boolean(bet));
}

export async function buildRecentBets(
  limit: number = DEFAULT_LIMIT,
  minBet: number = THRESHOLDS.minBetSizeUSD,
  since?: number,
): Promise<RecentBet[]> {
  const { trades, stats } = await fetchRecentBets(limit);
  const items = attachStatsToTrades(trades, stats, since);
  return filterSmartTraders(items, minBet);
}

export async function fetchWalletHistory(wallet: string): Promise<WalletHistory> {
  const stats = await fetchTraderStats(wallet.toLowerCase());
  if (!stats) {
    return {
      wallet: wallet.toLowerCase(),
      label: "Smart Trader",
      winRate: 0,
      rows: [],
    };
  }
  return {
    wallet: wallet.toLowerCase(),
    label: "Smart Trader",
    winRate: stats.winRate,
    rows: stats.closed,
  };
}
