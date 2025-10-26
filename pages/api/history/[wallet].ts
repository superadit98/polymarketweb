import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';

import { getSmartWallets } from '../../../lib/nansen';
import { fetchWalletData, getMockWalletHistory } from '../../../lib/poly';
import type { ResponseMeta, WalletHistoryResponse } from '../../../types';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=60';

function sanitiseMessage(message: string | undefined): string {
  if (!message) return 'Unknown error';
  return message.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function normaliseWalletParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WalletHistoryResponse>,
) {
  const rawWallet = normaliseWalletParam(req.query.wallet);
  if (!rawWallet) {
    const body: WalletHistoryResponse = {
      wallet: '',
      label: 'Unknown',
      winRate: 0,
      rows: [],
      meta: { error: 'Wallet address is required' },
    };
    const payload = JSON.stringify(body);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
    res.status(200).json(body);
    return;
  }

  const lowerWallet = rawWallet.toLowerCase();
  const { wallets, mock: walletMock, error: walletError } = await getSmartWallets();
  const meta: ResponseMeta = {};
  const errors: string[] = [];
  if (walletError) {
    errors.push(walletError);
    console.error('[history] smart wallet fetch failed', {
      message: sanitiseMessage(walletError),
    });
  }

  const match = wallets.find((wallet) => wallet.address.toLowerCase() === lowerWallet);
  const walletInfo = match ?? { address: rawWallet, label: 'Unknown' };

  if (walletMock) {
    const history = getMockWalletHistory(walletInfo);
    const body: WalletHistoryResponse = {
      ...history,
      meta: {
        mock: true,
        ...(errors.length ? { error: sanitiseMessage(errors.join('; ')) } : {}),
      },
    };
    const payload = JSON.stringify(body);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
    res.status(200).json(body);
    return;
  }

  const result = await fetchWalletData(walletInfo, 0);

  if (!result.ok) {
    if (result.meta?.mock) {
      const history = getMockWalletHistory(walletInfo);
      const body: WalletHistoryResponse = {
        ...history,
        meta: {
          mock: true,
          error: sanitiseMessage(result.error),
        },
      };
      const payload = JSON.stringify(body);
      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
      res.status(200).json(body);
      return;
    }

    console.error('[history] wallet fetch failed', {
      wallet: walletInfo.address,
      message: sanitiseMessage(result.error),
    });

    const body: WalletHistoryResponse = {
      wallet: walletInfo.address,
      label: walletInfo.label,
      winRate: 0,
      rows: [],
      meta: {
        ...(errors.length ? { error: sanitiseMessage(`${errors.join('; ')}; ${result.error}`) } : { error: sanitiseMessage(result.error) }),
      },
    };
    const payload = JSON.stringify(body);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
    res.status(200).json(body);
    return;
  }

  const { stats, historyRows } = result.data;

  if (errors.length) {
    meta.error = sanitiseMessage(errors.join('; '));
  }

  const body: WalletHistoryResponse = {
    wallet: walletInfo.address,
    label: walletInfo.label,
    winRate: stats.winRate,
    rows: historyRows,
    ...(meta.error ? { meta } : {}),
  };

  const payload = JSON.stringify(body);
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('ETag', `"${createHash('sha1').update(payload).digest('hex')}"`);
  res.status(200).json(body);
}
