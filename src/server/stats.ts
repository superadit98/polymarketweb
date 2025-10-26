import type { ClosedTrade, TraderStats } from '@/types';

export function safeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return null;
  }
  return null;
}

export function computeWinRate(closed: ClosedTrade[]): number {
  if (!closed.length) return 0;
  let wins = 0;
  let resolved = 0;
  for (const trade of closed) {
    if (trade.result === 'Pending') continue;
    resolved += 1;
    if (trade.result === 'Win') wins += 1;
  }
  if (!resolved) return 0;
  return wins / resolved;
}

export function applyThresholds(
  stats: TraderStats,
  sizeUSD: number,
  minBet: number,
): boolean {
  if (sizeUSD < minBet) return false;
  if (!Number.isFinite(stats.totalTrades) || stats.totalTrades <= 1_000) return false;
  if (!Number.isFinite(stats.largestWinUSD) || stats.largestWinUSD <= 10_000) return false;
  if (!Number.isFinite(stats.positionValueUSD) || stats.positionValueUSD <= 40_000) return false;
  if (!Number.isFinite(stats.realizedPnlUSD) || stats.realizedPnlUSD <= 50_000) return false;
  return true;
}

export function clampRecentBets<T extends { sizeUSD: number }>(items: T[], cap: number): T[] {
  return [...items].sort((a, b) => b.sizeUSD - a.sizeUSD).slice(0, cap);
}
