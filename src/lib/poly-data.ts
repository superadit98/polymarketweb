import { jfetch } from "./http";
import { norm } from "./util/addr";

const BASE = process.env.POLY_DATA_API_BASE?.trim() || "https://data-api.polymarket.com";

type JsonLike = Record<string, any> | null | undefined;

function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function firstArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    if (Array.isArray((value as JsonLike)?.data)) {
      return (value as any).data;
    }
    if (Array.isArray((value as JsonLike)?.trades)) {
      return (value as any).trades;
    }
    if (Array.isArray((value as JsonLike)?.fills)) {
      return (value as any).fills;
    }
    if (Array.isArray((value as JsonLike)?.positions)) {
      return (value as any).positions;
    }
    if (Array.isArray((value as JsonLike)?.results)) {
      return (value as any).results;
    }
  }
  return [];
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

function deriveMarketUrl(id?: string, slug?: string): string | undefined {
  if (slug) {
    return `https://polymarket.com/event/${slug}`;
  }
  if (id) {
    return `https://polymarket.com/event/${id}`;
  }
  return undefined;
}

export type ClosedTrade = {
  marketId: string;
  outcome: "YES" | "NO";
  sizeUSD: number;
  price: number;
  pnlUSD: number;
  closedAt?: number;
  marketQuestion?: string;
  marketUrl?: string;
};

export type Position = {
  marketId: string;
  valueUSD: number;
};

export type TraderStats = {
  totalTrades: number;
  largestWinUSD: number;
  positionValueUSD: number;
  realizedPnlUSD: number;
  winRate: number;
};

const CLOSED_TRADE_ENDPOINTS = [
  (addr: string, limit: number) => `${BASE}/trades?wallet=${addr}&state=closed&limit=${limit}`,
  (addr: string, limit: number) => `${BASE}/trades?address=${addr}&state=closed&limit=${limit}`,
  (addr: string, limit: number) => `${BASE}/fills?wallet=${addr}&closed=true&limit=${limit}`,
  (addr: string, limit: number) => `${BASE}/fills?address=${addr}&closed=true&limit=${limit}`,
];

const POSITION_ENDPOINTS = [
  (addr: string) => `${BASE}/positions?wallet=${addr}`,
  (addr: string) => `${BASE}/positions?address=${addr}`,
  (addr: string) => `${BASE}/portfolio?wallet=${addr}`,
  (addr: string) => `${BASE}/portfolio?address=${addr}`,
];

function normalizeClosedTrade(raw: any): ClosedTrade | null {
  const marketId = String(
    raw?.marketId ?? raw?.market_id ?? raw?.conditionId ?? raw?.id ?? ""
  );
  if (!marketId) {
    return null;
  }

  const sizeUSD =
    safeNumber(raw?.size_usd ?? raw?.sizeUSD ?? raw?.notional_usd ?? raw?.amountUsd);
  const price = safeNumber(raw?.price ?? raw?.avg_price ?? raw?.avgPrice);
  const pnlUSD = safeNumber(raw?.pnl_usd ?? raw?.pnlUSD ?? raw?.realized_pnl_usd);
  const question = raw?.market_question ?? raw?.marketQuestion ?? raw?.question;
  const slug = raw?.market_slug ?? raw?.marketSlug ?? raw?.slug;
  const closedAt = raw?.closed_at
    ? Math.floor(new Date(raw.closed_at).getTime() / 1000)
    : safeNumber(raw?.timestamp) || undefined;

  return {
    marketId,
    outcome: normalizeOutcome(raw?.outcome ?? raw?.side),
    sizeUSD,
    price,
    pnlUSD,
    closedAt,
    marketQuestion: question ? String(question) : undefined,
    marketUrl: deriveMarketUrl(marketId, slug ? String(slug) : undefined),
  };
}

export async function fetchClosedTrades(addr: string, limit = 1000): Promise<ClosedTrade[]> {
  const normalized = norm(addr);
  if (!normalized) {
    return [];
  }

  for (const builder of CLOSED_TRADE_ENDPOINTS) {
    const url = builder(normalized, limit);
    try {
      const data = await jfetch(url);
      const rows = firstArray(data);
      if (!rows.length) {
        continue;
      }
      const mapped = rows
        .map((row) => normalizeClosedTrade(row))
        .filter((trade): trade is ClosedTrade => Boolean(trade));
      if (mapped.length) {
        return mapped;
      }
    } catch (error) {
      // try next endpoint
      continue;
    }
  }

  return [];
}

function normalizePosition(raw: any): Position | null {
  const marketId = String(raw?.marketId ?? raw?.market_id ?? raw?.conditionId ?? raw?.id ?? "");
  if (!marketId) {
    return null;
  }
  const valueUSD = safeNumber(raw?.value_usd ?? raw?.valueUSD ?? raw?.mark_to_market_usd ?? raw?.usdValue);
  return {
    marketId,
    valueUSD,
  };
}

export async function fetchOpenPositions(addr: string): Promise<Position[]> {
  const normalized = norm(addr);
  if (!normalized) {
    return [];
  }

  for (const builder of POSITION_ENDPOINTS) {
    const url = builder(normalized);
    try {
      const data = await jfetch(url);
      const rows = firstArray(data);
      if (!rows.length) {
        continue;
      }
      const mapped = rows
        .map((row) => normalizePosition(row))
        .filter((position): position is Position => Boolean(position));
      if (mapped.length) {
        return mapped;
      }
    } catch (error) {
      continue;
    }
  }

  return [];
}

function summarizeStats(closed: ClosedTrade[], positions: Position[]): TraderStats {
  const totalTrades = closed.length;
  const wins = closed.filter((trade) => trade.pnlUSD > 0);
  const losses = closed.filter((trade) => trade.pnlUSD < 0);
  const largestWinUSD = wins.length ? Math.max(...wins.map((trade) => trade.pnlUSD)) : 0;
  const realizedPnlUSD = closed.reduce((sum, trade) => sum + trade.pnlUSD, 0);
  const positionValueUSD = positions.reduce((sum, position) => sum + position.valueUSD, 0);
  const closedCount = wins.length + losses.length;
  const winRate = closedCount ? (wins.length / closedCount) * 100 : 0;

  return {
    totalTrades,
    largestWinUSD,
    positionValueUSD,
    realizedPnlUSD,
    winRate,
  };
}

export async function computeTraderStats(addr: string, options?: {
  closed?: ClosedTrade[];
  positions?: Position[];
}): Promise<TraderStats> {
  const normalized = norm(addr);
  if (!normalized) {
    return {
      totalTrades: 0,
      largestWinUSD: 0,
      positionValueUSD: 0,
      realizedPnlUSD: 0,
      winRate: 0,
    };
  }

  const [closed, positions] = await Promise.all([
    options?.closed ? Promise.resolve(options.closed) : fetchClosedTrades(normalized, 1000),
    options?.positions ? Promise.resolve(options.positions) : fetchOpenPositions(normalized),
  ]);

  return summarizeStats(closed, positions);
}

export { summarizeStats };
