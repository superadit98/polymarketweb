import { ENV, assertPolyAccess } from './env';
import { fetchJson } from './http';
import { computeWinRate } from './stats';
import type {
  RecentBet,
  SmartWallet,
  TradeHistoryRow,
  TraderStats,
  WalletHistory,
} from './types';

const RECENT_BETS_LIMIT = 100;
const HISTORY_LIMIT = 200;

interface GraphQlResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

async function querySubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  assertPolyAccess();

  const payload = await fetchJson<GraphQlResponse<T>>(ENV.polySubgraphUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors.map((error) => error.message).join(', '));
  }

  return payload.data;
}

async function queryWithFallback<T>(
  primaryQuery: string,
  fallbackQuery: string | null,
  variables: Record<string, unknown>,
): Promise<T> {
  try {
    return await querySubgraph<T>(primaryQuery, variables);
  } catch (error) {
    const message = (error as Error).message;
    const shouldFallback =
      Boolean(fallbackQuery) && /Cannot query field|Unknown argument/i.test(message);

    if (!shouldFallback || !fallbackQuery) {
      throw error;
    }

    console.error('Retrying subgraph query with fallback selection', { message });
    return querySubgraph<T>(fallbackQuery, variables);
  }
}

type TraderStatsQuery = {
  trader: null | {
    id: string;
    totalTrades?: string;
    largestWinUsd?: string;
    currentPositionUsd?: string;
    realizedPnlUsd?: string;
  };
};

const TRADER_STATS_QUERY = `
  query TraderStats($id: ID!) {
    trader(id: $id) {
      id
      totalTrades
      largestWinUsd
      currentPositionUsd
      realizedPnlUsd
    }
  }
`;

const TRADER_STATS_QUERY_FALLBACK = `
  query TraderStatsFallback($id: ID!) {
    trader(id: $id) {
      id
      totalTrades
      currentPositionUsd
    }
  }
`;

type RecentFillsQuery = {
  fills: Array<{
    id: string;
    outcome: 'YES' | 'NO';
    price: string;
    usdValue: string;
    timestamp: string;
    market: {
      id: string;
      question: string;
      slug?: string | null;
    };
  }>;
};

const RECENT_FILLS_QUERY = `
  query RecentFills($trader: String!, $minUsd: BigDecimal!, $limit: Int!) {
    fills(
      first: $limit,
      orderBy: timestamp,
      orderDirection: desc,
      where: { trader: $trader, usdValue_gte: $minUsd }
    ) {
      id
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
  }
`;

type TradeHistoryQuery = {
  fills: Array<{
    id: string;
    outcome: 'YES' | 'NO';
    price: string;
    usdValue: string;
    realizedPnlUsd?: string | null;
    status?: 'Win' | 'Loss' | 'Pending';
    closedAt?: string | null;
    timestamp: string;
    market: {
      id: string;
      question: string;
      slug?: string | null;
    };
  }>;
};

const TRADE_HISTORY_QUERY = `
  query TraderHistory($trader: String!, $limit: Int!) {
    fills(
      first: $limit,
      orderBy: timestamp,
      orderDirection: desc,
      where: { trader: $trader }
    ) {
      id
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

const TRADE_HISTORY_QUERY_FALLBACK = `
  query TraderHistoryFallback($trader: String!, $limit: Int!) {
    fills(
      first: $limit,
      orderBy: timestamp,
      orderDirection: desc,
      where: { trader: $trader }
    ) {
      id
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
  }
`;

const MARKET_URL_BASE = 'https://polymarket.com/market';

const MOCK_MARKETS = [
  'Will Bitcoin close above $100k in 2024?',
  'Will the Fed cut rates before September 2024?',
  'Will ETH ETF be approved by 2025?',
  'Will AI regulation pass in the US by 2025?',
  'Will SpaceX Starship reach orbit before 2025?',
];

function buildMarketUrl(market: { id: string; slug?: string | null }) {
  if (market.slug) {
    const url = new URL(`https://polymarket.com/event/${market.slug}`);
    url.searchParams.set('marketId', market.id);
    return url.toString();
  }
  return `${MARKET_URL_BASE}/${market.id}`;
}

function parseNumber(value?: string | null): number {
  if (!value) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export async function fetchTraderStats(address: string): Promise<TraderStats> {
  if (ENV.useMockData) {
    return {
      totalTrades: 1200 + Math.floor(Math.random() * 800),
      largestWinUSD: 15_000 + Math.random() * 50_000,
      positionValueUSD: 60_000 + Math.random() * 100_000,
      realizedPnlUSD: 80_000 + Math.random() * 120_000,
      winRate: Math.random() * 0.3 + 0.55,
    };
  }

  try {
    const data = await queryWithFallback<TraderStatsQuery>(
      TRADER_STATS_QUERY,
      TRADER_STATS_QUERY_FALLBACK,
      {
        id: address.toLowerCase(),
      },
    );

    if (!data.trader) {
      return {
        totalTrades: 0,
        largestWinUSD: 0,
        positionValueUSD: 0,
        realizedPnlUSD: 0,
        winRate: 0,
      };
    }

    const largestWin = parseNumber(data.trader.largestWinUsd);
    const realized = parseNumber(data.trader.realizedPnlUsd);

    return {
      totalTrades: parseNumber(data.trader.totalTrades),
      largestWinUSD: largestWin,
      positionValueUSD: parseNumber(data.trader.currentPositionUsd),
      realizedPnlUSD: realized,
      winRate: 0,
    };
  } catch (error) {
    console.error('Failed to fetch trader stats', { address, error });
    throw error;
  }
}

export async function fetchRecentBets(
  wallet: SmartWallet,
  minBet: number,
  stats: TraderStats,
): Promise<RecentBet[]> {
  if (ENV.useMockData) {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: 3 }).map((_, index) => {
      const question = MOCK_MARKETS[(index + wallet.address.length) % MOCK_MARKETS.length];
      const sizeUSD = 500 + Math.random() * 50_000;
      return {
        wallet: wallet.address,
        label: wallet.label,
        outcome: index % 2 === 0 ? 'YES' : 'NO',
        sizeUSD,
        price: 0.4 + Math.random() * 0.5,
        marketId: `mock-market-${index}`,
        marketQuestion: question,
        marketUrl: 'https://polymarket.com/',
        traderStats: { ...stats },
        timestamp: now - index * 3600,
      } satisfies RecentBet;
    });
  }

  try {
    const data = await querySubgraph<RecentFillsQuery>(RECENT_FILLS_QUERY, {
      trader: wallet.address.toLowerCase(),
      minUsd: minBet,
      limit: RECENT_BETS_LIMIT,
    });

    const fills = Array.isArray(data.fills) ? data.fills : [];

    return fills.map((fill) => ({
      wallet: wallet.address,
      label: wallet.label,
      outcome: fill.outcome,
      sizeUSD: parseNumber(fill.usdValue),
      price: parseNumber(fill.price),
      marketId: fill.market.id,
      marketQuestion: fill.market.question,
      marketUrl: buildMarketUrl(fill.market),
      traderStats: { ...stats },
      timestamp: Number(fill.timestamp),
    }));
  } catch (error) {
    console.error('Failed to fetch recent bets', { wallet: wallet.address, error });
    throw error;
  }
}

export async function fetchWalletHistory(wallet: SmartWallet): Promise<WalletHistory> {
  if (ENV.useMockData) {
    const now = Math.floor(Date.now() / 1000);
    const rows: TradeHistoryRow[] = Array.from({ length: 8 }).map((_, index) => {
      const isWin = index % 3 !== 0;
      const sizeUSD = 500 + Math.random() * 20_000;
      const pnl = isWin ? Math.random() * sizeUSD * 0.8 : -Math.random() * sizeUSD * 0.6;
      return {
        marketId: `mock-history-${index}`,
        marketQuestion: MOCK_MARKETS[(index + 2) % MOCK_MARKETS.length],
        outcome: index % 2 === 0 ? 'YES' : 'NO',
        sizeUSD,
        price: 0.4 + Math.random() * 0.4,
        result: isWin ? 'Win' : 'Loss',
        pnlUSD: pnl,
        marketUrl: 'https://polymarket.com/',
        closedAt: now - index * 86400,
      } satisfies TradeHistoryRow;
    });

    const winRate = computeWinRate(rows);

    return {
      wallet: wallet.address,
      label: wallet.label,
      winRate,
      rows,
    };
  }

  try {
    const data = await queryWithFallback<TradeHistoryQuery>(
      TRADE_HISTORY_QUERY,
      TRADE_HISTORY_QUERY_FALLBACK,
      {
        trader: wallet.address.toLowerCase(),
        limit: HISTORY_LIMIT,
      },
    );

    const fills = Array.isArray(data.fills) ? data.fills : [];

    const rows = fills.map((fill) => {
      const pnl = fill.realizedPnlUsd != null ? parseNumber(fill.realizedPnlUsd) : 0;
      const status = fill.status;
      const result =
        status === 'Win' || status === 'Loss'
          ? status
          : pnl > 0
            ? 'Win'
            : pnl < 0
              ? 'Loss'
              : 'Pending';
      const closedAt = fill.closedAt ? Number(fill.closedAt) : undefined;
      return {
        marketId: fill.market.id,
        marketQuestion: fill.market.question,
        outcome: fill.outcome,
        sizeUSD: parseNumber(fill.usdValue),
        price: parseNumber(fill.price),
        result,
        pnlUSD: pnl,
        marketUrl: buildMarketUrl(fill.market),
        closedAt,
      } satisfies TradeHistoryRow;
    });

    const winRate = computeWinRate(rows);

    return {
      wallet: wallet.address,
      label: wallet.label,
      winRate,
      rows,
    };
  } catch (error) {
    console.error('Failed to fetch wallet history', { wallet: wallet.address, error });
    throw error;
  }
}
