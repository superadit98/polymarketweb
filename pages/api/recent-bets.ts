import type { NextApiRequest, NextApiResponse } from "next";
import type { RecentBet, RecentBetsResponse, TraderStats } from "@/types";

const POLY_API_KEY = "0x0927f37e82901ffda620a4ef83f43c115604825a4e20e3712a50111367179437";

const THRESHOLDS = {
  minTotalTrades: 1000,
  minLargestWinUSD: 10_000,
  minPositionValueUSD: 40_000,
  minRealizedPnlUSD: 50_000,
  minBetUSD: 100,
  minWinRateRatio: 0.5,
};

interface ClobTrade {
  proxyWallet?: string;
  user?: string;
  pseudonym?: string;
  outcome?: "YES" | "NO";
  side?: string;
  size?: number | string;
  price?: number | string;
  conditionId?: string;
  marketId?: string;
  title?: string;
  slug?: string;
  market_slug?: string;
  market?: { id?: string; question?: string; slug?: string };
  marketQuestion?: string;
  timestamp?: number;
  createdTime?: string;
  created_time?: string;
  totalTrades?: number;
  total_trades?: number;
  largestWin?: number;
  largest_win?: number;
  largestWinUSD?: number;
  positionValue?: number;
  position_value?: number;
  positionValueUSD?: number;
  realizedPnl?: number;
  realized_pnl?: number;
  realizedPnlUSD?: number;
  winRate?: number;
  win_rate?: number;
}

function safeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function parseTimestamp(trade: ClobTrade): number {
  if (Number.isFinite(trade.timestamp)) {
    return Number(trade.timestamp);
  }
  const iso = trade.createdTime || trade.created_time;
  if (iso) {
    const date = Date.parse(iso);
    if (!Number.isNaN(date)) return Math.floor(date / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function deriveStats(trade: ClobTrade): { stats: TraderStats; winRateRatio: number } {
  const totalTrades = safeNumber(trade.totalTrades ?? trade.total_trades) || 0;
  const largestWinUSD =
    safeNumber(trade.largestWinUSD ?? trade.largestWin ?? trade.largest_win) || 0;
  const positionValueUSD =
    safeNumber(trade.positionValueUSD ?? trade.positionValue ?? trade.position_value) || 0;
  const realizedPnlUSD =
    safeNumber(trade.realizedPnlUSD ?? trade.realizedPnl ?? trade.realized_pnl) || 0;
  const rawWinRate = safeNumber(trade.winRate ?? trade.win_rate) || 0;

  const winRateRatio = rawWinRate > 1 ? rawWinRate / 100 : rawWinRate;
  const stats: TraderStats = {
    totalTrades,
    largestWinUSD,
    positionValueUSD,
    realizedPnlUSD,
    winRate: Math.max(0, winRateRatio * 100),
  };

  return { stats, winRateRatio };
}

function mapTradeToRecentBet(trade: ClobTrade): RecentBet | null {
  const size = safeNumber(trade.size);
  const price = safeNumber(trade.price);
  if (!Number.isFinite(size) || !Number.isFinite(price)) {
    return null;
  }
  const sizeUSD = size * price;
  if (!Number.isFinite(sizeUSD)) {
    return null;
  }

  const { stats, winRateRatio } = deriveStats(trade);
  const passesThresholds =
    stats.totalTrades > THRESHOLDS.minTotalTrades &&
    stats.largestWinUSD > THRESHOLDS.minLargestWinUSD &&
    stats.positionValueUSD > THRESHOLDS.minPositionValueUSD &&
    stats.realizedPnlUSD > THRESHOLDS.minRealizedPnlUSD &&
    winRateRatio > THRESHOLDS.minWinRateRatio &&
    sizeUSD > THRESHOLDS.minBetUSD;

  if (!passesThresholds) {
    return null;
  }

  const wallet = trade.proxyWallet || trade.user;
  if (!wallet) {
    return null;
  }

  const marketId = trade.conditionId || trade.marketId || trade.market?.id || "";
  const slug = trade.slug || trade.market_slug || trade.market?.slug;
  const marketQuestion =
    trade.title || trade.marketQuestion || trade.market?.question || slug || "Polymarket market";

  const outcome = (trade.outcome || trade.side || "YES").toUpperCase() === "NO" ? "NO" : "YES";

  return {
    wallet,
    label: trade.pseudonym || "Smart Trader",
    outcome,
    sizeUSD,
    price,
    marketId,
    marketQuestion,
    marketUrl: slug ? `https://polymarket.com/market/${slug}` : "https://polymarket.com",
    traderStats: stats,
    timestamp: parseTimestamp(trade),
  };
}

async function fetchClobTrades(limit: number): Promise<ClobTrade[]> {
  const endpoint = `https://clob.polymarket.com/trades?limit=${Math.max(1, Math.min(limit, 100))}`;
  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      headers: {
        "X-API-KEY": POLY_API_KEY,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Polymarket CLOB error ${res.status}: ${body}`);
    }

    const json = await res.json();
    if (!Array.isArray(json)) {
      throw new Error("Unexpected CLOB response format");
    }
    return json as ClobTrade[];
  } catch (error) {
    const duration = Date.now() - start;
    console.error("[recent-bets] clob fetch failed", { duration, error });
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debug = String(req.query.debug ?? "") === "1";
  const hours = Number.isFinite(Number(req.query.hours)) ? Number(req.query.hours) : 24;
  const minBet = Number.isFinite(Number(req.query.minBet)) ? Number(req.query.minBet) : THRESHOLDS.minBetUSD;

  try {
    const trades = await fetchClobTrades(100);
    const items: RecentBet[] = [];

    for (const trade of trades) {
      const bet = mapTradeToRecentBet(trade);
      if (bet && bet.sizeUSD >= minBet) {
        items.push(bet);
      }
      if (items.length >= 50) break;
    }

    const uniqueWallets = new Set(items.map((item) => item.wallet)).size;
    const meta = {
      mode: debug ? "debug" : "live",
      counts: {
        fetched: trades.length,
        items: items.length,
        wallets: uniqueWallets,
        minBet,
        timeFiltered: hours,
      },
      reason: debug ? "debug=1" : undefined,
    };

    const payload: RecentBetsResponse = { items, meta };

    if (!debug) {
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    }

    res.status(200).json(debug ? payload : { items });
  } catch (error: any) {
    console.error("[recent-bets] error", error);
    res.status(500).json({ error: String(error?.message || error) });
  }
}
