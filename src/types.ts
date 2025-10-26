export type Outcome = 'YES' | 'NO';

export interface TraderStats {
  totalTrades: number;
  largestWinUSD: number;
  positionValueUSD: number;
  realizedPnlUSD: number;
  winRate: number;
}

export interface ClosedTrade {
  marketId: string;
  marketQuestion: string;
  outcome: Outcome;
  sizeUSD: number;
  price: number;
  pnlUSD: number;
  result: 'Win' | 'Loss' | 'Pending';
  marketUrl: string;
  closedAt?: number | null;
}

export interface HistoryRow extends ClosedTrade {}

export interface WalletHistory {
  wallet: string;
  label: string;
  winRate: number;
  rows: HistoryRow[];
}

export interface TraderStatsEnvelope extends TraderStats {
  closed: ClosedTrade[];
}

export interface RecentBet {
  wallet: string;
  label: string;
  outcome: Outcome;
  sizeUSD: number;
  price: number;
  marketId: string;
  marketQuestion: string;
  marketUrl: string;
  traderStats: TraderStats;
  timestamp: number;
}

export interface ResponseMeta {
  mock?: boolean;
  reason?: string;
  fallback?: 'rest';
}

export interface RecentBetsResponse {
  items: RecentBet[];
  meta?: ResponseMeta;
}

export interface WalletHistoryResponse extends WalletHistory {
  meta?: ResponseMeta;
}

export interface Fill {
  wallet: string;
  outcome: Outcome;
  sizeUSD: number;
  price: number;
  marketId: string;
  marketQuestion: string;
  marketUrl: string;
  timestamp: number;
}
