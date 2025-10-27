import type { TraderStats } from "@/types";
import type { Trade } from "./poly";
import { boolEnv } from "./env";

export const THRESHOLDS = {
  minTotalTrades: 100,
  minLargestWinUSD: 10_000,
  minPositionValueUSD: 10_000,
  minRealizedPnlUSD: 50_000,
  minBetSizeUSD: 100,
  minWinRate: 50,
};

export function computeWinRate(trades: Trade[]): number | null {
  const closed = trades.filter((trade) => typeof trade.pnlUSD === "number");
  const wins = closed.filter((trade) => (trade.pnlUSD ?? 0) > 0).length;
  const denom = closed.length;
  if (denom === 0) {
    return null;
  }
  return (wins / denom) * 100;
}

export function aggregateStats(trades: Trade[]): TraderStats {
  const totalTrades = trades.length;
  let largestWinUSD: number | null = null;
  let realizedPnlUSD: number | null = null;
  let positionValueUSD: number | null = null;

  for (const trade of trades) {
    if (typeof trade.pnlUSD === "number") {
      realizedPnlUSD = (realizedPnlUSD ?? 0) + trade.pnlUSD;
      if (trade.pnlUSD > 0) {
        largestWinUSD = Math.max(largestWinUSD ?? 0, trade.pnlUSD);
      }
    }
    if (Number.isFinite(trade.sizeUSD) && Number.isFinite(trade.price)) {
      const contribution = trade.sizeUSD * trade.price;
      positionValueUSD = (positionValueUSD ?? 0) + contribution;
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
  const limited = boolEnv("USE_LIMITED_MODE", false);
  const minLargest = limited ? 0 : THRESHOLDS.minLargestWinUSD;
  const minPnl = limited ? 0 : THRESHOLDS.minRealizedPnlUSD;
  const minWinRate = limited ? 0 : THRESHOLDS.minWinRate;

  return (
    (stats.totalTrades ?? 0) > THRESHOLDS.minTotalTrades &&
    (stats.largestWinUSD ?? 0) > minLargest &&
    (stats.positionValueUSD ?? 0) > THRESHOLDS.minPositionValueUSD &&
    (stats.realizedPnlUSD ?? 0) > minPnl &&
    (stats.winRate ?? 0) > minWinRate
  );
}
