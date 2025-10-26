import pLimit from 'p-limit';

import { fetchSmartWallets } from './nansen';
import { fetchRecentBets as fetchRecentBetsForWallet, fetchTraderStats, fetchWalletHistory } from './poly';
import { sanitizeRecentBets, traderPassesThresholds } from './stats';
import type { RecentBet, SmartWallet, WalletHistory } from './types';

const CONCURRENCY = 4;

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
