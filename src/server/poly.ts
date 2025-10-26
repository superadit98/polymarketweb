import { logger } from '@/lib/log';
import { env, hasPolySubgraph } from '@/lib/env';
import type { ClosedTrade, Fill, TraderStatsEnvelope } from '@/types';
import { fetchJson } from './http';
import { computeWinRate, safeNumber } from './stats';

type MarketRef = { id: string; question: string; slug?: string | null };

type RecentEntry = {
  trader: string;
  outcome: 'YES' | 'NO';
  price?: string | null;
  usdValue?: string | null;
  timestamp?: string | null;
  market?: MarketRef | null;
};

type HistoryEntry = RecentEntry & {
  realizedPnlUsd?: string | null;
  status?: string | null;
  closedAt?: string | null;
};

type TraderOverviewResponse = {
  data?: {
    trader?: {
      totalTrades?: string | null;
      largestWinUsd?: string | null;
      currentPositionUsd?: string | null;
      realizedPnlUsd?: string | null;
    } | null;
    recent?: RecentEntry[];
    history?: HistoryEntry[];
  };
  errors?: Array<{ message?: string }>;
};

const MARKET_URL_BASE = 'https://polymarket.com/event';

const TRADER_OVERVIEW_QUERY = `
  query TraderOverview(
    $wallet: String!
    $recentLimit: Int!
    $historyLimit: Int!
  ) {
    trader(id: $wallet) {
      totalTrades
      largestWinUsd
      currentPositionUsd
      realizedPnlUsd
    }
    recent: fills(
      first: $recentLimit
      orderBy: timestamp
      orderDirection: desc
      where: { trader: $wallet }
    ) {
      trader
      outcome
      price
      usdValue
      timestamp
      market {
        id
        question
        slug
      }
    }
    history: fills(
      first: $historyLimit
      orderBy: timestamp
      orderDirection: desc
      where: { trader: $wallet }
    ) {
      trader
      outcome
      price
      usdValue
      realizedPnlUsd
      status
      closedAt
      timestamp
      market {
        id
        question
        slug
      }
    }
  }
`;

const RECENT_LIMIT = 120;
const HISTORY_LIMIT = 250;

interface TraderOverview {
  stats: TraderStatsEnvelope;
  recent: Fill[];
}

const overviewCache = new Map<string, TraderOverview>();

function toMarketUrl(market?: { id: string; slug?: string | null } | null) {
  if (!market) return MARKET_URL_BASE;
  const slug = market.slug?.trim();
  if (slug) return `${MARKET_URL_BASE}/${slug}`;
  return `${MARKET_URL_BASE}/${market.id}`;
}

function parseClosedTrade(entry: HistoryEntry | null | undefined): ClosedTrade | null {
  if (!entry || !entry.market) return null;
  const sizeUSD = safeNumber(entry.usdValue);
  const price = safeNumber(entry.price);
  const pnlUSD = safeNumber(entry.realizedPnlUsd ?? 0) ?? 0;
  const closedAt = safeNumber(entry.closedAt ?? entry.timestamp ?? 0);
  if (sizeUSD === null || price === null) return null;
  const status = entry.status?.toLowerCase();
  let result: 'Win' | 'Loss' | 'Pending' = 'Pending';
  if (status === 'win' || status === 'won') result = 'Win';
  else if (status === 'loss' || status === 'lost') result = 'Loss';
  else if (status === 'pending') result = 'Pending';
  else if (pnlUSD > 0) result = 'Win';
  else if (pnlUSD < 0) result = 'Loss';
  return {
    marketId: entry.market.id,
    marketQuestion: entry.market.question,
    outcome: entry.outcome,
    sizeUSD,
    price,
    pnlUSD,
    result,
    marketUrl: toMarketUrl(entry.market),
    closedAt,
  };
}

function parseRecentFill(entry: RecentEntry | null | undefined): Fill | null {
  if (!entry || !entry.market) return null;
  const sizeUSD = safeNumber(entry.usdValue);
  const price = safeNumber(entry.price);
  const timestamp = safeNumber(entry.timestamp ?? 0);
  if (sizeUSD === null || price === null || timestamp === null) return null;
  return {
    wallet: entry.trader,
    outcome: entry.outcome,
    sizeUSD,
    price,
    marketId: entry.market.id,
    marketQuestion: entry.market.question,
    marketUrl: toMarketUrl(entry.market),
    timestamp,
  };
}

async function fetchOverview(wallet: string): Promise<TraderOverview> {
  const cached = overviewCache.get(wallet);
  if (cached) return cached;

  if (!hasPolySubgraph) {
    throw new Error('POLY_SUBGRAPH_URL missing');
  }

  const body = JSON.stringify({
    query: TRADER_OVERVIEW_QUERY,
    variables: {
      wallet: wallet.toLowerCase(),
      recentLimit: RECENT_LIMIT,
      historyLimit: HISTORY_LIMIT,
    },
  });

  const result = await fetchJson<TraderOverviewResponse>(env.polySubgraphUrl, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
    },
    source: 'poly-subgraph',
    endpoint: env.polySubgraphUrl,
    wallet,
  });

  if (!result.ok || !result.data) {
    const error = result.error ?? 'Unknown subgraph error';
    logger.error('[poly] subgraph request failed', { wallet, error });
    throw new Error(error);
  }

  if (Array.isArray(result.data.errors) && result.data.errors.length) {
    const error = result.data.errors.map((item) => item.message ?? 'Unknown error').join(', ');
    logger.error('[poly] subgraph query error', { wallet, error });
    throw new Error(error);
  }

  const payload = result.data.data;
  if (!payload) {
    throw new Error('Missing subgraph payload');
  }

  const stats: TraderStatsEnvelope = {
    totalTrades: safeNumber(payload.trader?.totalTrades) ?? 0,
    largestWinUSD: safeNumber(payload.trader?.largestWinUsd) ?? 0,
    positionValueUSD: safeNumber(payload.trader?.currentPositionUsd) ?? 0,
    realizedPnlUSD: safeNumber(payload.trader?.realizedPnlUsd) ?? 0,
    winRate: 0,
    closed: [],
  };

  const history: ClosedTrade[] = [];
  for (const entry of payload.history ?? []) {
    const trade = parseClosedTrade(entry);
    if (trade) {
      history.push(trade);
    }
  }
  stats.closed = history;
  stats.winRate = computeWinRate(history);

  const recent: Fill[] = [];
  for (const entry of payload.recent ?? []) {
    const fill = parseRecentFill(entry);
    if (fill) {
      recent.push(fill);
    }
  }

  const overview = { stats, recent };
  overviewCache.set(wallet, overview);
  return overview;
}

export async function queryRecentFills(addresses: string[], sinceMinutes: number): Promise<Fill[]> {
  const cutoff = Math.floor(Date.now() / 1000) - sinceMinutes * 60;
  const fills: Fill[] = [];
  for (const address of addresses) {
    const overview = await fetchOverview(address);
    for (const fill of overview.recent) {
      if (fill.timestamp >= cutoff) {
        fills.push(fill);
      }
    }
  }
  return fills;
}

export async function restRecentFills(addresses: string[], sinceMinutes: number): Promise<Fill[]> {
  const cutoff = Math.floor(Date.now() / 1000) - sinceMinutes * 60;
  const fills: Fill[] = [];
  for (const address of addresses) {
    const endpoint = `${env.polyRestBase}/fills?wallet=${encodeURIComponent(address)}&limit=200`;
    const result = await fetchJson<{ data?: Array<Record<string, unknown>> }>(endpoint, {
      method: 'GET',
      source: 'poly-rest',
      endpoint,
      wallet: address,
    });
    if (!result.ok || !result.data) {
      const error = result.error ?? 'Unknown REST error';
      logger.error('[poly] rest recent fills failed', { address, error });
      throw new Error(error);
    }

    const entries = result.data.data ?? [];
    for (const entry of entries) {
      const timestamp = safeNumber((entry as { timestamp?: unknown }).timestamp);
      const sizeUSD = safeNumber((entry as { usdValue?: unknown }).usdValue);
      const price = safeNumber((entry as { price?: unknown }).price);
      const marketId = (entry as { marketId?: unknown }).marketId;
      const marketQuestion = (entry as { marketQuestion?: unknown }).marketQuestion;
      if (
        timestamp === null ||
        timestamp < cutoff ||
        sizeUSD === null ||
        price === null ||
        typeof marketId !== 'string' ||
        typeof marketQuestion !== 'string'
      ) {
        continue;
      }
      const outcome = (entry as { outcome?: unknown }).outcome;
      if (outcome !== 'YES' && outcome !== 'NO') continue;
      fills.push({
        wallet: address,
        outcome,
        sizeUSD,
        price,
        marketId,
        marketQuestion,
        marketUrl: `${MARKET_URL_BASE}/${marketId}`,
        timestamp,
      });
    }
  }
  return fills;
}

export async function fetchTraderStats(address: string): Promise<TraderStatsEnvelope> {
  const overview = await fetchOverview(address);
  return overview.stats;
}

export async function probeSubgraph() {
  if (!hasPolySubgraph) {
    return { ok: false, error: 'POLY_SUBGRAPH_URL missing' };
  }
  try {
    const body = JSON.stringify({ query: '{ __typename }' });
    const result = await fetchJson<{ data?: unknown; errors?: Array<{ message?: string }> }>(
      env.polySubgraphUrl,
      {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
        },
        source: 'poly-subgraph',
        endpoint: env.polySubgraphUrl,
      },
    );
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Unknown subgraph error' };
    }
    if (Array.isArray(result.data?.errors) && result.data?.errors.length) {
      return {
        ok: false,
        error: result.data.errors.map((error) => error.message ?? 'Unknown error').join(', '),
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function probeRest() {
  try {
    const endpoint = `${env.polyRestBase}/markets/trending?limit=1`;
    const result = await fetchJson<{ data?: unknown }>(endpoint, {
      method: 'GET',
      source: 'poly-rest',
      endpoint,
    });
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Unknown REST error' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function clearOverviewCache() {
  overviewCache.clear();
}
