export type SmartWallet = {
  address: string;
  label: string;
};

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
  outcome: 'YES' | 'NO';
  sizeUSD: number;
  price: number;
  marketId: string;
  marketQuestion: string;
  marketUrl: string;
  traderStats: TraderStats;
  timestamp: number;
};

export type TradeHistoryRow = {
  marketId: string;
  marketQuestion: string;
  outcome: 'YES' | 'NO';
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
  rows: TradeHistoryRow[];
};
