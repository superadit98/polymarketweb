import { describe, expect, it } from 'vitest';

import { computeWinRate, sanitizeRecentBets, traderPassesThresholds } from './stats';
import type { RecentBet, TradeHistoryRow, TraderStats } from './types';

const baseStats: TraderStats = {
  totalTrades: 1500,
  largestWinUSD: 20_000,
  positionValueUSD: 80_000,
  realizedPnlUSD: 120_000,
  winRate: 0.6,
};

describe('computeWinRate', () => {
  it('returns 0 when there are no closed trades', () => {
    const rows: TradeHistoryRow[] = [];
    expect(computeWinRate(rows)).toBe(0);
  });

  it('computes wins divided by wins plus losses', () => {
    const rows: TradeHistoryRow[] = [
      { result: 'Win', marketId: '1', marketQuestion: '', outcome: 'YES', sizeUSD: 0, price: 0, pnlUSD: 0, marketUrl: '' },
      { result: 'Loss', marketId: '2', marketQuestion: '', outcome: 'NO', sizeUSD: 0, price: 0, pnlUSD: 0, marketUrl: '' },
      { result: 'Win', marketId: '3', marketQuestion: '', outcome: 'NO', sizeUSD: 0, price: 0, pnlUSD: 0, marketUrl: '' },
      { result: 'Pending', marketId: '4', marketQuestion: '', outcome: 'YES', sizeUSD: 0, price: 0, pnlUSD: 0, marketUrl: '' },
    ];

    expect(computeWinRate(rows)).toBeCloseTo(2 / 3);
  });
});

describe('traderPassesThresholds', () => {
  it('returns true when all thresholds are exceeded', () => {
    expect(traderPassesThresholds(baseStats)).toBe(true);
  });

  it('returns false when any threshold is not met', () => {
    expect(
      traderPassesThresholds({
        ...baseStats,
        totalTrades: 900,
      }),
    ).toBe(false);
    expect(
      traderPassesThresholds({
        ...baseStats,
        largestWinUSD: 5_000,
      }),
    ).toBe(false);
    expect(
      traderPassesThresholds({
        ...baseStats,
        positionValueUSD: 30_000,
      }),
    ).toBe(false);
    expect(
      traderPassesThresholds({
        ...baseStats,
        realizedPnlUSD: 10_000,
      }),
    ).toBe(false);
  });
});

describe('sanitizeRecentBets', () => {
  const bet = {
    wallet: '0x123',
    label: 'Smart Trader',
    outcome: 'YES' as const,
    sizeUSD: 10_000,
    price: 0.5,
    marketId: 'm1',
    marketQuestion: 'Question',
    marketUrl: 'https://polymarket.com',
    traderStats: baseStats,
    timestamp: 1,
  } satisfies RecentBet;

  it('filters out bets below the minimum', () => {
    const bets = [
      bet,
      { ...bet, marketId: 'm2', sizeUSD: 100 },
    ];

    const filtered = sanitizeRecentBets(bets, 500, 50);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].marketId).toBe('m1');
  });

  it('sorts bets by size descending and caps to the provided limit', () => {
    const bets = [
      bet,
      { ...bet, marketId: 'm2', sizeUSD: 40_000 },
      { ...bet, marketId: 'm3', sizeUSD: 25_000 },
    ];

    const filtered = sanitizeRecentBets(bets, 500, 2);
    expect(filtered.map((item) => item.marketId)).toEqual(['m2', 'm3']);
  });

  it('drops bets when trader stats fail thresholds', () => {
    const bets = [
      bet,
      { ...bet, marketId: 'm2', traderStats: { ...baseStats, totalTrades: 50 } },
    ];

    const filtered = sanitizeRecentBets(bets, 500, 50);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].marketId).toBe('m1');
  });
});
