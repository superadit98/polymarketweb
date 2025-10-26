import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';

import { getSmartWallets } from '../../lib/nansen';
import { fetchWalletData, getMockRecentBets } from '../../lib/poly';
import { clampRecentBets, passesTraderFilters } from '../../lib/stats';
import type { RecentBet, RecentBetsResponse, ResponseMeta } from '../../types';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=60';

function parseMinBet(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? 500);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 500;
  }
  return parsed;
}

function sanitiseMessage(message: string | undefined): string {
  if (!message) return 'Unknown error';
  return message.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecentBetsResponse>,
) {
  const minBet = parseMinBet(req.query.minBet);
  const { wallets, mock: walletMock, error: walletError } = await getSmartWallets();

  const meta: ResponseMeta = {};
  const errors: string[] = [];
  if (walletError) {
    errors.push(walletError);
    console.error('[recent-bets] smart wallet fetch failed', {
      message: sanitiseMessage(walletError),
    });
  }

  const useMock = walletMock;

  if (useMock) {
    meta.mock = true;
    if (errors.length) {
      meta.error = sanitiseMessage(errors.join('; '));
    }
    const items = getMockRecentBets(minBet);
    const body: RecentBetsResponse = {
      items,
      meta,
    };
    const payload = JSON.stringify(body);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
    res.status(200).json(body);
    return;
  }

  const aggregated: RecentBet[] = [];

  for (const wallet of wallets) {
    const result = await fetchWalletData(wallet, minBet);
    if (!result.ok) {
      errors.push(result.error);
      console.error('[recent-bets] wallet fetch failed', {
        wallet: wallet.address,
        message: sanitiseMessage(result.error),
      });
      if (result.meta?.mock) {
        meta.mock = true;
        break;
      }
      continue;
    }

    const { stats, recentBets } = result.data;
    if (!passesTraderFilters(stats)) {
      continue;
    }

    if (recentBets.length === 0) {
      continue;
    }

    aggregated.push(...recentBets);
  }

  let items = clampRecentBets(aggregated, 50);

  if (meta.mock) {
    items = getMockRecentBets(minBet);
  }

  if (items.length === 0 && aggregated.length === 0 && !meta.mock) {
    if (!wallets.length) {
      errors.push('No eligible wallets returned by Nansen');
    }
  }

  if (errors.length) {
    meta.error = sanitiseMessage(errors.join('; '));
  }

  if (meta.mock) {
    meta.mock = true;
  }

  const body: RecentBetsResponse = {
    items,
    ...(meta.mock || meta.error ? { meta } : {}),
  };

  const payload = JSON.stringify(body);
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
  res.status(200).json(body);
}
