import type { HistoryRow, RecentBet, TraderStats, WalletHistory } from "@/types";

const DATA_API = "https://data-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";

const POLY_API_KEY = process.env.POLY_API_KEY?.trim() || "";

export type Trade = {
  proxyWallet: string;
  side: "BUY" | "SELL";
  outcome?: "YES" | "NO";
  size: string;
  price: string;
  conditionId: string;
  title?: string;
  slug?: string;
  timestamp: number;
  pseudonym?: string;
  market_question?: string;
  market?: Record<string, any> | null;
  [key: string]: any;
};

type MarketMap = Record<string, any>;

type FetchInit = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT = 15_000;

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function safeTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) {
      return Math.floor(asDate.getTime() / 1000);
    }
  }
  return Math.floor(Date.now() / 1000);
}

export function normalizeOutcome(value: unknown): "YES" | "NO" {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "YES" || raw === "NO") return raw as "YES" | "NO";
  if (raw === "BUY") return "YES";
  if (raw === "SELL") return "NO";
  return "YES";
}

function tradeSlug(trade: Trade): string | null {
  return (
    trade.slug ||
    trade.market_slug ||
    trade.market?.slug ||
    trade.marketSlug ||
    null
  );
}

function withTimeout(
  init?: FetchInit
): { init: RequestInit; controller: AbortController; timeoutId: NodeJS.Timeout } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), init?.timeoutMs ?? DEFAULT_TIMEOUT);
  const headers = init?.headers ? { ...init.headers } : {};
  return {
    init: { signal: controller.signal, headers },
    controller,
    timeoutId,
  };
}

async function fetchJson<T = any>(url: string, init?: FetchInit): Promise<T> {
  const { init: requestInit, controller, timeoutId } = withTimeout(init);
  try {
    const res = await fetch(url, { ...requestInit });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${url}: ${String(error)}`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    return data as T;
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}

function normalizeTrade(raw: any): Trade | null {
  const wallet = String(raw?.proxyWallet ?? raw?.user ?? "").toLowerCase();
  if (!wallet) return null;

  const sideRaw = String(raw?.side ?? raw?.outcome ?? "BUY").toUpperCase();
  const side: "BUY" | "SELL" = sideRaw === "SELL" ? "SELL" : "BUY";

  const outcomeValue = raw?.outcome ?? (side === "BUY" ? "YES" : "NO");
  const size = String(raw?.size ?? raw?.contracts ?? raw?.amount ?? raw?.amount_usd ?? "0");
  const price = String(raw?.price ?? raw?.tradePrice ?? raw?.avgPrice ?? "0");
  const conditionId = String(
    raw?.conditionId ?? raw?.market_id ?? raw?.marketId ?? raw?.condition_id ?? ""
  );
  const timestamp = safeTimestamp(raw?.timestamp ?? raw?.created_time ?? raw?.time);

  return {
    ...raw,
    proxyWallet: wallet,
    side,
    outcome: normalizeOutcome(outcomeValue),
    size,
    price,
    conditionId,
    title: raw?.title ?? raw?.market_question ?? raw?.market?.question,
    slug: raw?.slug ?? raw?.market_slug ?? raw?.market?.slug,
    timestamp,
    pseudonym: raw?.pseudonym ?? raw?.profile ?? raw?.user_label,
    market_question: raw?.market_question ?? raw?.market?.question,
    market: raw?.market ?? null,
  };
}

export async function fetchRecentTrades(limit = 200): Promise<Trade[]> {
  const url = `${DATA_API}/trades?limit=${Math.max(1, Math.min(limit, 500))}`;
  const json = await fetchJson<any>(url, { headers: { Accept: "application/json" } });
  const tradesArray = Array.isArray(json?.trades) ? json.trades : Array.isArray(json) ? json : [];
  return tradesArray
    .map((raw: any) => normalizeTrade(raw))
    .filter((trade: Trade | null): trade is Trade => Boolean(trade));
}

export async function fetchMarketsBySlugs(slugs: string[]): Promise<MarketMap> {
  if (!slugs.length) return {};
  const unique = Array.from(new Set(slugs.filter(Boolean)));
  const chunkSize = 20;
  const results: Record<string, any> = {};

  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const url = `${DATA_API}/markets?slugs=${encodeURIComponent(slice.join(","))}`;
    try {
      const payload = await fetchJson<any>(url, { headers: { Accept: "application/json" } });
      const arr = Array.isArray(payload?.markets) ? payload.markets : Array.isArray(payload) ? payload : [];
      for (const market of arr) {
        const slug = market?.slug;
        if (typeof slug === "string" && slug) {
          results[slug] = market;
        }
      }
    } catch (error) {
      console.error(`[markets] fetch error for ${slice.join(",")}:`, error);
    }
  }

  return results;
}

async function clobGet(path: string): Promise<any[] | Record<string, any> | null> {
  if (!POLY_API_KEY) return null;
  const url = `${CLOB_API}${path}`;
  try {
    const json = await fetchJson<any>(url, {
      headers: {
        Accept: "application/json",
        "X-API-Key": POLY_API_KEY,
      },
    });
    return json;
  } catch (error) {
    console.error(`[clob] ${path} error`, error);
    return null;
  }
}

function aggregatePortfolioValue(portfolio: any): number {
  const positions = Array.isArray(portfolio?.positions) ? portfolio.positions : [];
  return positions.reduce((total: number, position: any) => {
    const value = safeNumber(position?.usdValue ?? position?.usd_value ?? 0, 0);
    return total + value;
  }, 0);
}

function aggregateFillStats(fills: any[]): {
  totalTrades: number;
  largestWinUSD: number;
  realizedPnlUSD: number;
  wins: number;
  losses: number;
} {
  let totalTrades = 0;
  let largestWinUSD = 0;
  let realizedPnlUSD = 0;
  let wins = 0;
  let losses = 0;

  for (const fill of fills) {
    totalTrades += 1;
    const realized = safeNumber(fill?.realizedPnlUSD ?? fill?.realized_pnl_usd ?? 0, 0);
    realizedPnlUSD += realized;
    if (realized > 0) {
      wins += 1;
      largestWinUSD = Math.max(largestWinUSD, realized);
    } else if (realized < 0) {
      losses += 1;
    }
  }

  return { totalTrades, largestWinUSD, realizedPnlUSD, wins, losses };
}

export async function fetchTraderStats(wallet: string): Promise<TraderStats | null> {
  if (!POLY_API_KEY) return null;
  const fillsPayload = await clobGet(`/fills?proxyWallet=${wallet}&limit=1000`);
  const fillsArray = Array.isArray(fillsPayload)
    ? fillsPayload
    : Array.isArray((fillsPayload as any)?.fills)
      ? (fillsPayload as any).fills
      : [];
  const portfolioPayload = await clobGet(`/portfolio?proxyWallet=${wallet}`);

  if (!fillsArray.length && !portfolioPayload) {
    return null;
  }

  const { totalTrades, largestWinUSD, realizedPnlUSD, wins, losses } = aggregateFillStats(fillsArray);
  const positionValueUSD = aggregatePortfolioValue(portfolioPayload);
  const denominator = Math.max(1, wins + losses);
  const winRate = denominator > 0 ? (wins / denominator) * 100 : 0;

  return {
    totalTrades,
    largestWinUSD,
    positionValueUSD,
    realizedPnlUSD,
    winRate,
  };
}

function extractResolution(market: any): { resolved: boolean; outcome: "YES" | "NO" | null } {
  if (!market) return { resolved: false, outcome: null };
  const candidates = [
    market?.resolution,
    market?.resolvedOutcome,
    market?.resolved_outcome,
    market?.winningOutcome,
    market?.winning_outcome,
    market?.outcome,
    market?.result,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      const normalized = normalizeOutcome(candidate);
      return { resolved: true, outcome: normalized };
    }
  }
  return { resolved: false, outcome: null };
}

export function deriveApproximateStats(trades: Trade[], markets: MarketMap): TraderStats | null {
  let wins = 0;
  let losses = 0;

  for (const trade of trades) {
    const slug = tradeSlug(trade);
    const market = slug ? markets[slug] : undefined;
    const { resolved, outcome } = extractResolution(market);
    if (!resolved || !outcome) continue;
    const tradeOutcome = normalizeOutcome(trade.outcome ?? trade.side);
    if (tradeOutcome === outcome) {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  const total = wins + losses;
  if (!total) {
    return null;
  }

  return {
    totalTrades: total,
    largestWinUSD: 0,
    positionValueUSD: 0,
    realizedPnlUSD: 0,
    winRate: (wins / total) * 100,
  };
}

export function tradeValueUSD(trade: Trade): number {
  const size = safeNumber(trade.size, 0);
  const price = safeNumber(trade.price, 0);
  return size * price * 100;
}

function mapTradeToHistoryRow(
  trade: Trade,
  market: any,
  realizedPnl: number | null
): HistoryRow {
  const pnlUSD = realizedPnl ?? 0;
  let result: "Win" | "Loss" | "Pending" = "Pending";
  if (pnlUSD > 0) result = "Win";
  else if (pnlUSD < 0) result = "Loss";

  const resolution = extractResolution(market);
  if (result === "Pending" && resolution.resolved && resolution.outcome) {
    const outcome = normalizeOutcome(trade.outcome ?? trade.side);
    result = outcome === resolution.outcome ? "Win" : "Loss";
  }

  const sizeUsd = safeNumber(trade.amount_usd ?? trade.cost_usd, NaN);
  const sizeValue = Number.isFinite(sizeUsd) ? sizeUsd : tradeValueUSD(trade);

  return {
    marketId: trade.conditionId,
    marketQuestion: trade.title ?? trade.market_question ?? "Polymarket market",
    outcome: normalizeOutcome(trade.outcome ?? trade.side),
    sizeUSD: sizeValue,
    price: safeNumber(trade.price, 0),
    result,
    pnlUSD,
    marketUrl: trade.slug
      ? `https://polymarket.com/market/${trade.slug}`
      : "https://polymarket.com",
    closedAt: trade.updated_time ? safeTimestamp(trade.updated_time) : trade.timestamp,
  };
}

export async function fetchWalletHistory(wallet: string): Promise<WalletHistory> {
  if (!POLY_API_KEY) {
    throw new Error("POLY_API_KEY is required for wallet history");
  }

  const fillsPayload = await clobGet(`/fills?proxyWallet=${wallet}&limit=500`);
  const fillsArray = Array.isArray(fillsPayload)
    ? fillsPayload
    : Array.isArray((fillsPayload as any)?.fills)
      ? (fillsPayload as any).fills
      : [];

  const tradesPayload = await fetchJson<any>(
    `${DATA_API}/trades?user=${wallet}&limit=200`,
    { headers: { Accept: "application/json" } }
  ).catch(() => []);
  const tradesArray = Array.isArray(tradesPayload?.trades)
    ? tradesPayload.trades
    : Array.isArray(tradesPayload)
      ? tradesPayload
      : [];
  const trades = tradesArray
    .map((raw: any) => normalizeTrade(raw))
    .filter((trade: Trade | null): trade is Trade => Boolean(trade));

  const slugs = trades
    .map((trade: Trade) => tradeSlug(trade))
    .filter((slug: string | null | undefined): slug is string => Boolean(slug));
  const markets = await fetchMarketsBySlugs(slugs);

  const realizedMap = new Map<string, number>();
  for (const fill of fillsArray) {
    const id = String(fill?.id ?? fill?.tradeId ?? "");
    if (!id) continue;
    realizedMap.set(id, safeNumber(fill?.realizedPnlUSD ?? fill?.realized_pnl_usd ?? 0, 0));
  }

  let wins = 0;
  let losses = 0;

  const rows: HistoryRow[] = trades.map((trade: Trade) => {
    const market = tradeSlug(trade) ? markets[tradeSlug(trade)!] : undefined;
    const pnl = realizedMap.get(String(trade.id ?? trade.transactionHash ?? trade.txHash ?? "")) ?? null;
    const row = mapTradeToHistoryRow(trade, market, pnl);
    if (row.result === "Win") wins += 1;
    else if (row.result === "Loss") losses += 1;
    return row;
  });

  const denominator = Math.max(1, wins + losses);
  const winRate = wins + losses > 0 ? wins / denominator : 0;

  return {
    wallet,
    label: "Smart Trader",
    winRate,
    rows,
  };
}

export function buildRecentBet(
  trade: Trade,
  stats: TraderStats,
  markets: MarketMap,
  label: string
): RecentBet {
  const market = tradeSlug(trade) ? markets[tradeSlug(trade)!] : undefined;
  const question =
    trade.title ??
    trade.market_question ??
    market?.question ??
    market?.title ??
    "Polymarket market";
  const slug = tradeSlug(trade);
  const url = slug ? `https://polymarket.com/market/${slug}` : "https://polymarket.com";
  return {
    wallet: trade.proxyWallet,
    label,
    outcome: normalizeOutcome(trade.outcome ?? trade.side),
    sizeUSD: tradeValueUSD(trade),
    price: safeNumber(trade.price, 0),
    marketId: trade.conditionId,
    marketQuestion: question,
    marketUrl: typeof trade.image === "string" && trade.image ? trade.image : url,
    traderStats: stats,
    timestamp: trade.timestamp,
  };
}

export function hasClobAccess(): boolean {
  return Boolean(POLY_API_KEY);
}
