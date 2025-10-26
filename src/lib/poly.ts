import { norm } from "./util/addr";

export type Outcome = "YES" | "NO";

export type Trade = {
  wallet: string;
  walletLower: string;
  marketId: string;
  marketQuestion: string;
  marketSlug?: string;
  marketUrl: string;
  outcome: Outcome;
  sizeUSD: number;
  price: number;
  timestamp: number;
  result?: "Win" | "Loss" | "Pending";
  pnlUSD?: number;
};

const POLY_BASE = "https://data-api.polymarket.com";

function safeNum(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function mkMarketUrl(slug?: string) {
  return slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com";
}

function toTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  return Math.floor(Date.now() / 1000);
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

function normalizeTrade(raw: any): Trade | null {
  const walletRaw = String(raw?.proxyWallet ?? raw?.trader ?? raw?.wallet ?? "");
  const walletLower = norm(walletRaw);
  if (!walletLower) {
    return null;
  }

  const price = safeNum(raw?.price ?? raw?.avgPrice ?? raw?.tradePrice);
  const size = safeNum(raw?.sizeUSD ?? raw?.amountUsd ?? raw?.amount_usd ?? raw?.size);
  const timestamp = toTimestamp(raw?.timestamp ?? raw?.created_time ?? raw?.time);
  const question =
    raw?.market?.question ?? raw?.marketQuestion ?? raw?.question ?? raw?.title ?? "Unknown market";
  const slug = raw?.market?.slug ?? raw?.marketSlug ?? raw?.slug;
  const marketId = raw?.market?.id ?? raw?.marketId ?? raw?.conditionId ?? raw?.id ?? "unknown";

  const trade: Trade = {
    wallet: walletLower,
    walletLower,
    marketId: String(marketId),
    marketQuestion: String(question),
    marketSlug: slug ? String(slug) : undefined,
    marketUrl: mkMarketUrl(slug ? String(slug) : undefined),
    outcome: normalizeOutcome(raw?.outcome ?? raw?.side),
    sizeUSD: size,
    price,
    timestamp,
  };

  if (typeof raw?.pnlUSD === "number") {
    trade.pnlUSD = raw.pnlUSD;
    trade.result = raw.pnlUSD > 0 ? "Win" : raw.pnlUSD < 0 ? "Loss" : "Pending";
  } else if (typeof raw?.realizedPnlUSD === "number") {
    trade.pnlUSD = raw.realizedPnlUSD;
    trade.result = raw.realizedPnlUSD > 0 ? "Win" : raw.realizedPnlUSD < 0 ? "Loss" : "Pending";
  }

  return trade.sizeUSD > 0 && trade.price >= 0 && trade.price <= 1 ? trade : null;
}

export async function getRecentTrades(limit = 200): Promise<Trade[]> {
  const res = await fetch(`${POLY_BASE}/trades?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) {
    return [];
  }
  const data = await res.json().catch(() => null);
  const rows = Array.isArray(data) ? data : Array.isArray(data?.trades) ? data.trades : [];
  return rows
    .map((row: any) => normalizeTrade(row))
    .filter((trade: Trade | null): trade is Trade => Boolean(trade));
}

export async function getWalletTrades(wallet: string, limit = 500): Promise<Trade[]> {
  const res = await fetch(`${POLY_BASE}/trades?limit=${limit}&wallet=${wallet}`, { cache: "no-store" });
  if (!res.ok) {
    return [];
  }
  const data = await res.json().catch(() => null);
  const rows = Array.isArray(data) ? data : Array.isArray(data?.trades) ? data.trades : [];
  return rows
    .map((row: any) => normalizeTrade({ ...row, proxyWallet: wallet }))
    .filter((trade: Trade | null): trade is Trade => Boolean(trade));
}
