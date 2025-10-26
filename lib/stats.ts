import type { HistoryRow, RecentBet, TraderStats } from '../types';

export function safeNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}

export function computeWinRate(rows: Array<Pick<HistoryRow, 'result'>>): number {
  const totals = rows.reduce(
    (acc, row) => {
      if (row.result === 'Win') acc.wins += 1;
      if (row.result === 'Loss') acc.losses += 1;
      return acc;
    },
    { wins: 0, losses: 0 },
  );

  const total = totals.wins + totals.losses;
  if (total === 0) {
    return 0;
  }
  return totals.wins / total;
}

export function passesTraderFilters(stats: TraderStats): boolean {
  return (
    stats.totalTrades > 1000 &&
    stats.largestWinUSD > 10_000 &&
    stats.positionValueUSD > 40_000 &&
    stats.realizedPnlUSD > 50_000
  );
}

export function sortRecentBets(bets: RecentBet[]): RecentBet[] {
  return [...bets].sort((a, b) => b.sizeUSD - a.sizeUSD);
}

export function clampRecentBets(bets: RecentBet[], cap: number): RecentBet[] {
  if (cap <= 0) {
    return [];
  }
  return sortRecentBets(bets).slice(0, cap);
}
