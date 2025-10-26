import type { RecentBet, TradeHistoryRow, TraderStats } from './types';

export const TRADER_THRESHOLDS = {
  totalTrades: 1000,
  largestWinUSD: 10_000,
  positionValueUSD: 40_000,
  realizedPnlUSD: 50_000,
};

export function computeWinRate(rows: TradeHistoryRow[]): number {
  const summary = rows.reduce(
    (acc, row) => {
      if (row.result === 'Win') acc.wins += 1;
      if (row.result === 'Loss') acc.losses += 1;
      return acc;
    },
    { wins: 0, losses: 0 },
  );

  const total = summary.wins + summary.losses;
  if (total === 0) return 0;
  return summary.wins / total;
}

export function traderPassesThresholds(stats: TraderStats): boolean {
  return (
    stats.totalTrades > TRADER_THRESHOLDS.totalTrades &&
    stats.largestWinUSD > TRADER_THRESHOLDS.largestWinUSD &&
    stats.positionValueUSD > TRADER_THRESHOLDS.positionValueUSD &&
    stats.realizedPnlUSD > TRADER_THRESHOLDS.realizedPnlUSD
  );
}

export function sanitizeRecentBets(
  bets: RecentBet[],
  minBet: number,
  limit = 50,
): RecentBet[] {
  return bets
    .filter((bet) =>
      bet.sizeUSD >= minBet &&
      Number.isFinite(bet.sizeUSD) &&
      Number.isFinite(bet.price) &&
      traderPassesThresholds(bet.traderStats),
    )
    .sort((a, b) => b.sizeUSD - a.sizeUSD)
    .slice(0, limit);
}
