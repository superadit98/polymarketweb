import { createHash, randomUUID } from 'node:crypto';

import type { NextApiRequest, NextApiResponse } from 'next';

import { hasNansen, hasPolySubgraph } from '@/lib/env';
import { logger } from '@/lib/log';
import { fetchSmartWallets } from '@/server/nansen';
import { fetchTraderStats } from '@/server/poly';
import type { WalletHistoryResponse } from '@/types';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=60';
const MARKET_URL_BASE = 'https://polymarket.com/event';

function makeEtag(payload: WalletHistoryResponse) {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `"${digest.slice(0, 16)}"`;
}

function normaliseWalletParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WalletHistoryResponse | { code: string; message: string; hint?: string }>,
) {
  const requestId = randomUUID();
  res.setHeader('x-request-id', requestId);
  const rawWallet = normaliseWalletParam(req.query.wallet);

  if (!rawWallet) {
    res.status(400).json({
      code: 'invalid_request',
      message: 'Wallet parameter is required',
      hint: 'Pass the wallet address as /api/history/[wallet] path segment',
    });
    return;
  }

  try {
    if (!hasNansen && !hasPolySubgraph) {
      const payload: WalletHistoryResponse = {
        wallet: rawWallet,
        label: 'Unknown',
        winRate: 0,
        rows: [],
        meta: { mock: true, reason: 'Nansen and Polymarket configuration missing' },
      };
      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('ETag', makeEtag(payload));
      res.setHeader('X-Mock', '1');
      res.status(200).json(payload);
      return;
    }

    if (!hasNansen) {
      throw new Error('Nansen API key is not configured');
    }

    if (!hasPolySubgraph) {
      throw new Error('Polymarket subgraph URL is not configured');
    }

    const wallets = await fetchSmartWallets();
    const walletAddress = rawWallet.toLowerCase();
    const wallet = wallets.find((item) => item.address.toLowerCase() === walletAddress);
    const label = wallet?.label ?? 'Unknown';

    const stats = await fetchTraderStats(walletAddress);

    const rows = stats.closed.map((trade) => ({
      marketId: trade.marketId,
      marketQuestion: trade.marketQuestion,
      outcome: trade.outcome,
      sizeUSD: trade.sizeUSD,
      price: trade.price,
      result: trade.result,
      pnlUSD: trade.pnlUSD,
      marketUrl: trade.marketUrl ?? `${MARKET_URL_BASE}/${trade.marketId}`,
      closedAt: trade.closedAt ?? undefined,
    }));

    const payload: WalletHistoryResponse = {
      wallet: walletAddress,
      label,
      winRate: stats.winRate,
      rows,
    };

    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', makeEtag(payload));
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[history] request failed', { requestId, message, wallet: rawWallet });
    res.status(500).json({
      code: 'wallet_history_error',
      message,
      hint: 'Verify Nansen and Polymarket connectivity via /api/debug',
    });
  }
}
