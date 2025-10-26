import { createHash, randomUUID } from 'node:crypto';

import type { NextApiRequest, NextApiResponse } from 'next';

import { hasNansen, hasPolySubgraph } from '@/lib/env';
import { logger } from '@/lib/log';
import { fetchSmartWallets } from '@/server/nansen';
import {
  fetchTraderStats,
  queryRecentFills,
  restRecentFills,
} from '@/server/poly';
import { applyThresholds, clampRecentBets } from '@/server/stats';
import type { RecentBet, RecentBetsResponse, ResponseMeta } from '@/types';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=60';
const SINCE_MINUTES = 120;
const MAX_ITEMS = 50;
const MARKET_URL_BASE = 'https://polymarket.com/event';

function parseMinBet(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value ?? 500);
  if (!Number.isFinite(parsed) || parsed < 0) return 500;
  return parsed;
}

function makeEtag(payload: RecentBetsResponse) {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `"${digest.slice(0, 16)}"`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecentBetsResponse | { code: string; message: string; hint?: string }>,
) {
  const requestId = randomUUID();
  res.setHeader('x-request-id', requestId);

  try {
    const minBet = parseMinBet(req.query.minBet);

    if (!hasNansen && !hasPolySubgraph) {
      const body: RecentBetsResponse = {
        items: [],
        meta: {
          mock: true,
          reason: 'Nansen and Polymarket configuration missing',
        },
      };
      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('ETag', makeEtag(body));
      res.setHeader('X-Mock', '1');
      res.status(200).json(body);
      return;
    }

    if (!hasNansen) {
      throw new Error('Nansen API key is not configured');
    }

    if (!hasPolySubgraph) {
      throw new Error('Polymarket subgraph URL is not configured');
    }

    const wallets = await fetchSmartWallets();
    if (!wallets.length) {
      throw new Error('No smart wallets returned by Nansen');
    }

    const walletMap = new Map(wallets.map((wallet) => [wallet.address.toLowerCase(), wallet.label]));

    const addresses = wallets.map((wallet) => wallet.address.toLowerCase());
    const meta: ResponseMeta = {};

    let fills: Awaited<ReturnType<typeof queryRecentFills>> = [];
    try {
      fills = await queryRecentFills(addresses, SINCE_MINUTES);
    } catch (error) {
      logger.warn('[recent-bets] subgraph query failed, using REST fallback', {
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });
      fills = await restRecentFills(addresses, SINCE_MINUTES);
      meta.fallback = 'rest';
    }

    if (!fills.length && !meta.fallback) {
      try {
        fills = await restRecentFills(addresses, SINCE_MINUTES);
        meta.fallback = 'rest';
      } catch (error) {
        throw new Error(
          `Failed to query Polymarket fills: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!fills.length) {
      const body: RecentBetsResponse = { items: [], meta };
      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('ETag', makeEtag(body));
      res.status(200).json(body);
      return;
    }

    const uniqueAddresses = Array.from(new Set(fills.map((fill) => fill.wallet.toLowerCase())));
    const statsByWallet = new Map<string, Awaited<ReturnType<typeof fetchTraderStats>>>();

    for (const address of uniqueAddresses) {
      const stats = await fetchTraderStats(address);
      statsByWallet.set(address, stats);
    }

    const items: RecentBet[] = [];
    for (const fill of fills) {
      const address = fill.wallet.toLowerCase();
      const stats = statsByWallet.get(address);
      const label = walletMap.get(address) ?? 'Unknown';
      if (!stats) continue;
      if (!applyThresholds(stats, fill.sizeUSD, minBet)) continue;
      items.push({
        wallet: address,
        label,
        outcome: fill.outcome,
        sizeUSD: fill.sizeUSD,
        price: fill.price,
        marketId: fill.marketId,
        marketQuestion: fill.marketQuestion,
        marketUrl: fill.marketUrl || `${MARKET_URL_BASE}/${fill.marketId}`,
        traderStats: {
          totalTrades: stats.totalTrades,
          largestWinUSD: stats.largestWinUSD,
          positionValueUSD: stats.positionValueUSD,
          realizedPnlUSD: stats.realizedPnlUSD,
          winRate: stats.winRate,
        },
        timestamp: fill.timestamp,
      });
    }

    const response: RecentBetsResponse = {
      items: clampRecentBets(items, MAX_ITEMS),
      ...(meta.fallback ? { meta } : {}),
    };

    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('ETag', makeEtag(response));
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[recent-bets] request failed', { requestId, message });
    res.status(500).json({
      code: 'recent_bets_error',
      message,
      hint: 'Check /api/debug for environment diagnostics',
    });
  }
}
