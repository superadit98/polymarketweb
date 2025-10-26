import type { Trade } from "./poly";

export const THRESHOLDS = {
  minTotalTrades: 1000,
  minLargestWinUSD: 10_000,
  minPositionValueUSD: 40_000,
  minRealizedPnlUSD: 50_000,
  minBetSizeUSD: 100,
  minWinRate: 0.5, // 50%
};

export type TraderStats = {
  totalTrades: number;
  largestWinUSD: number;
  positionValueUSD: number;
  realizedPnlUSD: number;
  winRate: number;
};

export function computeWinRate(trades: Trade[]): number {
  const closed = trades.filter((trade) => typeof trade.pnlUSD === "number");
  if (closed.length === 0) return 0;
  const wins = closed.filter((trade) => (trade.pnlUSD ?? 0) > 0).length;
  return wins / closed.length;
}

export function aggregateStats(trades: Trade[]): TraderStats {
  const totalTrades = trades.length;
  let largestWinUSD = 0;
  let realizedPnlUSD = 0;
  let positionValueUSD = 0;

  for (const trade of trades) {
    const pnl = trade.pnlUSD ?? 0;
    realizedPnlUSD += pnl;
    if (pnl > largestWinUSD) {
      largestWinUSD = pnl;
    }
    if (Number.isFinite(trade.sizeUSD) && Number.isFinite(trade.price)) {
      positionValueUSD += trade.sizeUSD * trade.price;
    }
  }

  const winRate = computeWinRate(trades);

  return {
    totalTrades,
    largestWinUSD,
    positionValueUSD,
    realizedPnlUSD,
    winRate,
  };
}

export function passesThresholds(stats: TraderStats): boolean {
  return (
    stats.totalTrades > THRESHOLDS.minTotalTrades &&
    stats.largestWinUSD > THRESHOLDS.minLargestWinUSD &&
    stats.positionValueUSD > THRESHOLDS.minPositionValueUSD &&
    stats.realizedPnlUSD > THRESHOLDS.minRealizedPnlUSD &&
    stats.winRate > THRESHOLDS.minWinRate
  );
}
