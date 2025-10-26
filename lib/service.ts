import pLimit from 'p-limit';

import { fetchSmartWallets } from './nansen';
import { fetchRecentBets as fetchRecentBetsForWallet, fetchTraderStats, fetchWalletHistory } from './poly';
import { sanitizeRecentBets, traderPassesThresholds } from './stats';
import type { RecentBet, SmartWallet, WalletHistory } from './types';

const CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      if (current >= items.length) {
        return;
      }
      nextIndex = current + 1;
      results[current] = await task(items[current], current);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

export async function getRecentBets(minBet: number): Promise<RecentBet[]> {
  const wallets = await fetchSmartWallets();
  const groupedBets = await mapWithConcurrency(wallets, CONCURRENCY, async (wallet) => {
    try {
      const stats = await fetchTraderStats(wallet.address);
      if (!traderPassesThresholds(stats)) {
        return [] as RecentBet[];
      }

      const history = await fetchWalletHistory(wallet);
      const statsWithWinRate = { ...stats, winRate: history.winRate };
      const walletBets = await fetchRecentBetsForWallet(wallet, minBet, statsWithWinRate, history.winRate);

      return walletBets.map((bet) => ({
        ...bet,
        traderStats: statsWithWinRate,
      }));
    } catch (error) {
      console.error('Failed to process wallet', { wallet: wallet.address, error });
      return [] as RecentBet[];
    }
  });

  const flattened = groupedBets.flat();
  return sanitizeRecentBets(flattened, minBet, 50);
const limit = pLimit(CONCURRENCY);

export async function getRecentBets(minBet: number): Promise<RecentBet[]> {
  const wallets = await fetchSmartWallets();
  const bets: RecentBet[] = [];

  await Promise.all(
    wallets.map((wallet) =>
      limit(async () => {
        try {
          const stats = await fetchTraderStats(wallet.address);
          if (!traderPassesThresholds(stats)) {
            return;
          }

          const history = await fetchWalletHistory(wallet);
          const statsWithWinRate = { ...stats, winRate: history.winRate };
          const walletBets = await fetchRecentBetsForWallet(
            wallet,
            minBet,
            statsWithWinRate,
            history.winRate,
          );
          bets.push(
            ...walletBets.map((bet) => ({
              ...bet,
              traderStats: statsWithWinRate,
            })),
          );
        } catch (error) {
          console.error('Failed to process wallet', { wallet: wallet.address, error });
        }
      }),
    ),
  );

  return sanitizeRecentBets(bets, minBet, 50);
}

export async function getWalletHistory(walletAddress: string): Promise<WalletHistory> {
  const wallets = await fetchSmartWallets();
  const wallet = wallets.find((item) => item.address.toLowerCase() === walletAddress.toLowerCase());

  const fallback: SmartWallet = wallet ?? {
    address: walletAddress,
    label: 'Smart Trader',
  };

  return fetchWalletHistory(fallback);
}
