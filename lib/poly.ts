import { ENV, isMockMode } from './env';
import { fetchJson } from './http';
import { computeWinRate, safeNumber } from './stats';
import type {
  HistoryRow,
  RecentBet,
  ResponseMeta,
  SmartWallet,
  TraderStats,
  WalletHistory,
} from '../types';
import { getMockWallets } from './nansen';

const RECENT_LIMIT = 60;
const HISTORY_LIMIT = 200;
const MARKET_URL_BASE = 'https://polymarket.com/event';

const TRADER_OVERVIEW_QUERY = `
  query TraderOverview(
    $id: ID!
    $wallet: String!
    $minUsd: BigDecimal!
    $recentLimit: Int!
    $historyLimit: Int!
  ) {
    trader: trader(id: $id) {
      id
      totalTrades
      largestWinUsd
      currentPositionUsd
      realizedPnlUsd
    }
    recent: fills(
      first: $recentLimit
      orderBy: timestamp
      orderDirection: desc
      where: { trader: $wallet, usdValue_gte: $minUsd }
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
    history: fills(
      first: $historyLimit
      orderBy: timestamp
      orderDirection: desc
      where: { trader: $wallet }
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

type TraderOverviewResponse = {
  data?: {
    trader?: {
      totalTrades?: string | null;
      largestWinUsd?: string | null;
      currentPositionUsd?: string | null;
      realizedPnlUsd?: string | null;
    } | null;
    recent?: Array<{
      id: string;
      outcome: 'YES' | 'NO';
      price?: string | null;
      usdValue?: string | null;
      timestamp?: string | null;
      market?: { id: string; question: string; slug?: string | null } | null;
    }>;
    history?: Array<{
      id: string;
      outcome: 'YES' | 'NO';
      price?: string | null;
      usdValue?: string | null;
      realizedPnlUsd?: string | null;
      status?: string | null;
      closedAt?: string | null;
      timestamp?: string | null;
      market?: { id: string; question: string; slug?: string | null } | null;
    }>;
  };
  errors?: Array<{ message?: string }>;
};

export type WalletData = {
  stats: TraderStats;
  recentBets: RecentBet[];
  historyRows: HistoryRow[];
};

export type WalletDataResult =
  | { ok: true; data: WalletData }
  | { ok: false; error: string; meta?: ResponseMeta };

function toMarketUrl(market?: { id: string; slug?: string | null }): string {
  if (!market) return MARKET_URL_BASE;
  const slug = market.slug?.trim();
  if (slug) {
    return `${MARKET_URL_BASE}/${slug}`;
  }
  return `${MARKET_URL_BASE}/${market.id}`;
}

function normaliseResult(status: string | null | undefined, pnlUSD: number | null, closedAt: number | null):
  | 'Win'
  | 'Loss'
  | 'Pending' {
  if (status) {
    const normalised = status.trim().toLowerCase();
    if (normalised === 'win' || normalised === 'won' || normalised === 'wontrade') {
      return 'Win';
    }
    if (normalised === 'loss' || normalised === 'lost' || normalised === 'losttrade') {
      return 'Loss';
    }
    if (normalised === 'pending') {
      return 'Pending';
    }
  }

  if (closedAt !== null && closedAt !== undefined) {
    if (pnlUSD !== null && pnlUSD !== undefined) {
      if (pnlUSD > 0) return 'Win';
      if (pnlUSD < 0) return 'Loss';
    }
    return 'Pending';
  }

  return 'Pending';
}

function cloneStats(stats: TraderStats): TraderStats {
  return { ...stats };
}

export async function fetchWalletData(
  wallet: SmartWallet,
  minBet: number,
): Promise<WalletDataResult> {
  if (isMockMode()) {
    return { ok: false, error: 'Mock mode active', meta: { mock: true } };
  }

  if (!ENV.polySubgraphUrl) {
    return { ok: false, error: 'POLY_SUBGRAPH_URL missing', meta: { mock: true } };
  }

  const variables = {
    id: wallet.address.toLowerCase(),
    wallet: wallet.address.toLowerCase(),
    minUsd: String(minBet),
    recentLimit: RECENT_LIMIT,
    historyLimit: HISTORY_LIMIT,
  };

  const result = await fetchJson<TraderOverviewResponse>(ENV.polySubgraphUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: TRADER_OVERVIEW_QUERY, variables }),
  });

  if (!result.ok) {
    console.error('[poly] request failed', { message: result.error });
    return { ok: false, error: result.error };
  }

  if (result.data?.errors?.length) {
    const message = result.data.errors.map((error) => error.message ?? 'Unknown error').join(', ');
    console.error('[poly] query errors', { message });
    return { ok: false, error: message };
  }

  const payload = result.data?.data;
  if (!payload) {
    return { ok: false, error: 'Missing subgraph response' };
  }

  const traderStatsRaw = payload.trader ?? null;
  const stats: TraderStats = {
    totalTrades: safeNumber(traderStatsRaw?.totalTrades) ?? 0,
    largestWinUSD: safeNumber(traderStatsRaw?.largestWinUsd) ?? 0,
    positionValueUSD: safeNumber(traderStatsRaw?.currentPositionUsd) ?? 0,
    realizedPnlUSD: safeNumber(traderStatsRaw?.realizedPnlUsd) ?? 0,
    winRate: 0,
  };

  const historyRows = (payload.history ?? []).reduce<HistoryRow[]>((acc, fill) => {
    const sizeUSD = safeNumber(fill.usdValue);
    if (sizeUSD === null) {
      return acc;
    }

    const price = safeNumber(fill.price) ?? 0;
    const pnlUSD = safeNumber(fill.realizedPnlUsd) ?? 0;
    const closedAt = safeNumber(fill.closedAt);
    const resultStatus = normaliseResult(fill.status, pnlUSD, closedAt);

    const market = fill.market ?? { id: 'unknown', question: 'Unknown market' };

    acc.push({
      marketId: market.id,
      marketQuestion: market.question,
      outcome: fill.outcome,
      sizeUSD,
      price,
      result: resultStatus,
      pnlUSD,
      marketUrl: toMarketUrl(market),
      closedAt,
    });

    return acc;
  }, []);

  const winRate = computeWinRate(historyRows);
  stats.winRate = winRate;

  const recentBets: RecentBet[] = (payload.recent ?? [])
    .map((fill) => {
      const sizeUSD = safeNumber(fill.usdValue);
      const price = safeNumber(fill.price) ?? 0;
      const timestamp = safeNumber(fill.timestamp);
      if (sizeUSD === null || timestamp === null) {
        return null;
      }
      if (sizeUSD <= minBet) {
        return null;
      }

      const market = fill.market ?? { id: 'unknown', question: 'Unknown market' };

      return {
        wallet: wallet.address,
        label: wallet.label,
        outcome: fill.outcome,
        sizeUSD,
        price,
        marketId: market.id,
        marketQuestion: market.question,
        marketUrl: toMarketUrl(market),
        traderStats: cloneStats(stats),
        timestamp,
      } satisfies RecentBet;
    })
    .filter((bet): bet is RecentBet => Boolean(bet));

  return {
    ok: true,
    data: {
      stats,
      recentBets,
      historyRows,
    },
  };
}

const MOCK_MARKETS = [
  { id: 'mock-btc-100k', slug: 'will-bitcoin-close-above-100k-in-2024', question: 'Will Bitcoin close above $100k in 2024?' },
  { id: 'mock-fed-cut', slug: 'will-the-fed-cut-rates-before-september-2024', question: 'Will the Fed cut rates before September 2024?' },
  { id: 'mock-eth-etf', slug: 'will-eth-etf-be-approved-by-2025', question: 'Will an ETH ETF be approved by 2025?' },
  { id: 'mock-ai-law', slug: 'will-us-pass-major-ai-regulation-by-2025', question: 'Will the US pass major AI regulation by 2025?' },
  { id: 'mock-spacex', slug: 'will-spacex-starship-reach-orbit-before-2025', question: 'Will SpaceX Starship reach orbit before 2025?' },
  { id: 'mock-election', slug: 'will-the-2024-us-election-go-to-a-recount', question: 'Will the 2024 US election go to a recount?' },
  { id: 'mock-oil', slug: 'will-oil-stay-above-100-by-2025', question: 'Will oil stay above $100 by 2025?' },
  { id: 'mock-gbtc', slug: 'will-gbtc-outflows-end-in-2024', question: 'Will GBTC outflows end in 2024?' },
  { id: 'mock-nvidia', slug: 'will-nvidia-hit-2t-market-cap-in-2024', question: 'Will NVIDIA hit a $2T market cap in 2024?' },
  { id: 'mock-tesla', slug: 'will-tesla-launch-a-robotaxi-fleet-by-2025', question: 'Will Tesla launch a robotaxi fleet by 2025?' },
];

type MockHistoryRecord = {
  stats: TraderStats;
  rows: HistoryRow[];
};

const MOCK_DATASET = (() => {
  const wallets = getMockWallets();
  const histories = new Map<string, MockHistoryRecord>();
  const recent: RecentBet[] = [];
  const baseTimestamp = 1_710_000_000;

  wallets.forEach((wallet, index) => {
    const market = MOCK_MARKETS[index % MOCK_MARKETS.length];
    const secondaryMarket = MOCK_MARKETS[(index + 1) % MOCK_MARKETS.length];

    const historyRows: HistoryRow[] = Array.from({ length: 5 }).map((_, rowIndex) => {
      const targetMarket = MOCK_MARKETS[(index + rowIndex) % MOCK_MARKETS.length];
      const outcome = rowIndex % 2 === 0 ? 'YES' : 'NO';
      const sizeUSD = 1_200 + index * 80 + rowIndex * 50;
      const price = 0.35 + (rowIndex % 3) * 0.1;
      const result: HistoryRow['result'] = rowIndex === 2 ? 'Pending' : rowIndex % 2 === 0 ? 'Win' : 'Loss';
      const pnlUSD = result === 'Win' ? 1_800 + rowIndex * 120 : result === 'Loss' ? -900 - rowIndex * 80 : 0;
      const closedAt = result === 'Pending' ? null : baseTimestamp - rowIndex * 8_600 + index * 2_400;

      return {
        marketId: targetMarket.id,
        marketQuestion: targetMarket.question,
        outcome,
        sizeUSD,
        price: Number(price.toFixed(2)),
        result,
        pnlUSD,
        marketUrl: `${MARKET_URL_BASE}/${targetMarket.slug}`,
        closedAt,
      } satisfies HistoryRow;
    });

    const winRate = computeWinRate(historyRows);

    const stats: TraderStats = {
      totalTrades: 1_450 + index * 45,
      largestWinUSD: 15_000 + index * 1_200,
      positionValueUSD: 55_000 + index * 4_200,
      realizedPnlUSD: 65_000 + index * 3_800,
      winRate,
    };

    const primaryBet: RecentBet = {
      wallet: wallet.address,
      label: wallet.label,
      outcome: index % 2 === 0 ? 'YES' : 'NO',
      sizeUSD: 2_000 + index * 150,
      price: 0.4 + ((index % 4) * 0.12),
      marketId: market.id,
      marketQuestion: market.question,
      marketUrl: `${MARKET_URL_BASE}/${market.slug}`,
      traderStats: { ...stats },
      timestamp: baseTimestamp + index * 3_200,
    };

    const secondaryBet: RecentBet = {
      wallet: wallet.address,
      label: wallet.label,
      outcome: index % 3 === 0 ? 'NO' : 'YES',
      sizeUSD: 1_600 + index * 120,
      price: 0.52 + ((index + 1) % 5) * 0.07,
      marketId: secondaryMarket.id,
      marketQuestion: secondaryMarket.question,
      marketUrl: `${MARKET_URL_BASE}/${secondaryMarket.slug}`,
      traderStats: { ...stats },
      timestamp: baseTimestamp + index * 3_200 - 1_600,
    };

    histories.set(wallet.address.toLowerCase(), { stats, rows: historyRows });
    recent.push(primaryBet, secondaryBet);
  });

  return { recent, histories };
})();

export function getMockRecentBets(minBet: number): RecentBet[] {
  return MOCK_DATASET.recent.filter((bet) => bet.sizeUSD > minBet);
}

export function getMockWalletHistory(wallet: SmartWallet): WalletHistory {
  const record = MOCK_DATASET.histories.get(wallet.address.toLowerCase());

  if (!record) {
    return {
      wallet: wallet.address,
      label: wallet.label,
      winRate: 0,
      rows: [],
    };
  }

  return {
    wallet: wallet.address,
    label: wallet.label,
    winRate: record.stats.winRate,
    rows: record.rows,
  };
}
