import type { HistoryRow, RecentBet, TraderStats, WalletHistory } from "@/types";

const POLY_API = "https://data-api.polymarket.com";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toTimestampSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return Math.floor(asNumber);
    }
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) {
      return Math.floor(asDate.getTime() / 1000);
    }
  }
  return Math.floor(Date.now() / 1000);
}

function normalizeOutcome(value: unknown): "YES" | "NO" {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "YES" || raw === "NO") {
    return raw as "YES" | "NO";
  }
  if (raw === "BUY") return "YES";
  if (raw === "SELL") return "NO";
  return "YES";
}

function emptyStats(): TraderStats {
  return {
    totalTrades: 0,
    largestWinUSD: 0,
    positionValueUSD: 0,
    realizedPnlUSD: 0,
    winRate: 0,
  };
}

function mapTradeToRecentBet(trade: any): RecentBet | null {
  if (!trade) return null;
  const size = toNumber(trade.size);
  const price = toNumber(trade.price);
  const sizeUsd = size * price * 100;
  const wallet = String(trade.proxyWallet || trade.user || "").toLowerCase();
  if (!wallet) return null;

  return {
    wallet,
    label: String(trade.pseudonym || "Unknown Trader"),
    outcome: normalizeOutcome(trade.outcome ?? trade.side),
    sizeUSD: sizeUsd,
    price,
    marketId: String(trade.conditionId ?? trade.market_id ?? trade.marketId ?? ""),
    marketQuestion: String(trade.title ?? trade.slug ?? trade.market_question ?? "Unknown market"),
    marketUrl:
      typeof trade.image === "string" && trade.image
        ? trade.image
        : `https://polymarket.com/market/${trade.slug ?? trade.market_slug ?? ""}`,
    traderStats: emptyStats(),
    timestamp: toTimestampSeconds(trade.timestamp ?? trade.created_time),
  };
}

export async function fetchRecentBets(limit = 50, minBetUSD = 500): Promise<RecentBet[]> {
  try {
    const url = `${POLY_API}/trades?limit=${limit}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) throw new Error(`Polymarket API error ${res.status}`);
    const data = await res.json();

    const trades = Array.isArray(data?.trades) ? data.trades : Array.isArray(data) ? data : [];
    const largeTrades = trades.filter((trade: any) => {
      const size = toNumber(trade?.size);
      const price = toNumber(trade?.price);
      return size * price * 100 > minBetUSD;
    });

    return largeTrades
      .map((trade: any) => mapTradeToRecentBet(trade))
      .filter((trade: RecentBet | null): trade is RecentBet => Boolean(trade))
      .slice(0, 50);
  } catch (err) {
    console.error("fetchRecentBets error:", err);
    return [];
  }
}

function mapTradeToHistoryRow(trade: any): HistoryRow {
  const pnlUSD = toNumber(trade.realized_pnl_usd ?? trade.realized_pnl ?? 0);
  const result = pnlUSD > 0 ? "Win" : pnlUSD < 0 ? "Loss" : "Pending";
  const price = toNumber(trade.price);
  const size = toNumber(trade.amount_usd ?? trade.cost_usd ?? trade.size ?? 0);

  return {
    marketId: String(trade.market_id ?? trade.conditionId ?? ""),
    marketQuestion: String(trade.market_question ?? trade.title ?? "Unknown market"),
    outcome: normalizeOutcome(trade.outcome ?? trade.side),
    sizeUSD: size,
    price,
    result,
    pnlUSD,
    marketUrl:
      typeof trade.image === "string" && trade.image
        ? trade.image
        : `https://polymarket.com/market/${trade.slug ?? trade.market_slug ?? ""}`,
    closedAt: trade.updated_time ? toTimestampSeconds(trade.updated_time) : undefined,
  };
}

export async function fetchWalletHistory(wallet: string): Promise<WalletHistory> {
  try {
    const res = await fetch(`${POLY_API}/trades?user=${wallet}&limit=200`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to fetch wallet history: ${res.status}`);
    const data = await res.json();
    const trades = Array.isArray(data?.trades) ? data.trades : [];

    const wins = trades.filter((t: any) => toNumber(t.realized_pnl_usd ?? t.realized_pnl ?? 0) > 0).length;
    const losses = trades.filter((t: any) => toNumber(t.realized_pnl_usd ?? t.realized_pnl ?? 0) < 0).length;
    const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;

    return {
      wallet,
      label: "Smart Trader",
      winRate,
      rows: trades.map((t: any) => mapTradeToHistoryRow(t)),
    };
  } catch (err) {
    console.error("fetchWalletHistory error:", err);
    return {
      wallet,
      label: "Smart Trader",
      winRate: 0,
      rows: [],
    };
  }
}
