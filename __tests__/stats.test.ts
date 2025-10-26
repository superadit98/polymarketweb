import { describe, expect, it } from 'vitest';

import { clampRecentBets, computeWinRate, passesTraderFilters, safeNumber } from '../lib/stats';
import type { HistoryRow, RecentBet, TraderStats } from '../types';

const baseStats: TraderStats = {
  totalTrades: 1_500,
  largestWinUSD: 15_000,
  positionValueUSD: 55_000,
  realizedPnlUSD: 65_000,
  winRate: 0.6,
};

describe('computeWinRate', () => {
  it('ignores pending results and divides closed wins by total closed trades', () => {
    const rows: Array<Pick<HistoryRow, 'result'>> = [
      { result: 'Win' },
      { result: 'Loss' },
      { result: 'Win' },
      { result: 'Pending' },
    ];

    expect(computeWinRate(rows)).toBeCloseTo(2 / 3, 5);
  });
});

describe('passesTraderFilters', () => {
  it('returns true when all profitability thresholds are satisfied', () => {
    expect(passesTraderFilters(baseStats)).toBe(true);
  });

  it('returns false when any threshold is below the configured minimum', () => {
    expect(
      passesTraderFilters({
        ...baseStats,
        totalTrades: 800,
      }),
    ).toBe(false);

    expect(
      passesTraderFilters({
        ...baseStats,
        largestWinUSD: 9_000,
      }),
    ).toBe(false);
  });
});

describe('clampRecentBets', () => {
  function createBet(sizeUSD: number): RecentBet {
    return {
      wallet: `0x${sizeUSD.toString(16)}`,
      label: 'Test',
      outcome: 'YES',
      sizeUSD,
      price: 0.5,
      marketId: `market-${sizeUSD}`,
      marketQuestion: 'Mock question',
      marketUrl: 'https://polymarket.com/event/mock',
      traderStats: baseStats,
      timestamp: sizeUSD,
    };
  }

  it('sorts bets by size descending and enforces the requested cap', () => {
    const bets = [createBet(200), createBet(1500), createBet(750)];

    const clamped = clampRecentBets(bets, 2);
    expect(clamped).toHaveLength(2);
    expect(clamped[0].sizeUSD).toBe(1500);
    expect(clamped[1].sizeUSD).toBe(750);
  });
});

describe('safeNumber', () => {
  it('coerces numeric strings and rejects invalid values', () => {
    expect(safeNumber('123.5')).toBeCloseTo(123.5);
    expect(safeNumber('not-a-number')).toBeNull();
    expect(safeNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
