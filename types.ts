export type Outcome = 'YES' | 'NO';

export type TraderStats = {
  totalTrades: number;
  largestWinUSD: number;
  positionValueUSD: number;
  realizedPnlUSD: number;
  winRate: number;
};

export type RecentBet = {
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
};

export type HistoryRow = {
  marketId: string;
  marketQuestion: string;
  outcome: Outcome;
  sizeUSD: number;
  price: number;
  result: 'Win' | 'Loss' | 'Pending';
  pnlUSD: number;
  marketUrl: string;
  closedAt?: number | null;
};

export type WalletHistory = {
  wallet: string;
  label: string;
  winRate: number;
  rows: HistoryRow[];
};

export type ResponseMeta = {
  mock?: boolean;
  error?: string;
};

export type SmartWallet = {
  address: string;
  label: string;
};

export type RecentBetsResponse = {
  items: RecentBet[];
  meta?: ResponseMeta;
};

export type WalletHistoryResponse = WalletHistory & {
  meta?: ResponseMeta;
};
