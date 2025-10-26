import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl } from "@/lib/env";
import { THRESHOLDS, attachStatsToTrades, fetchRecentBets, filterSmartTraders, meetsTraderThresholds } from "@/lib/poly";
import type { RecentBetsResponse } from "@/types";

function parseNumber(value: unknown, fallback: number, { min, max }: { min: number; max: number }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debug = String(req.query.debug ?? "") === "1";
  const minBetRaw = Number(req.query.minBet ?? THRESHOLDS.minBetSizeUSD);
  const minBet = Number.isFinite(minBetRaw) && minBetRaw > 0 ? minBetRaw : THRESHOLDS.minBetSizeUSD;
  const hours = parseNumber(req.query.hours, 24, { min: 1, max: 24 * 30 });
  const since = Math.max(0, Math.floor(Date.now() / 1000 - hours * 3600));

  const meta: {
    hours: number;
    minBet: number;
    counts: {
      tradesFetched: number;
      walletsEnriched: number;
      afterStats: number;
      afterThresholds: number;
      afterMinBet: number;
    };
    probe: { ok: boolean; variant?: string; errors: string[] };
    errors: string[];
  } = {
    hours,
    minBet,
    counts: {
      tradesFetched: 0,
      walletsEnriched: 0,
      afterStats: 0,
      afterThresholds: 0,
      afterMinBet: 0,
    },
    probe: { ok: false, errors: [] },
    errors: [],
  };

  try {
    const polyBase = getPolyUrl();
    if (!polyBase) {
      res.status(500).json({ error: "Polymarket data API base URL is not configured" });
      return;
    }

    const { trades, stats } = await fetchRecentBets(200);
    meta.counts.tradesFetched = trades.length;
    meta.counts.walletsEnriched = stats.size;

    const enriched = attachStatsToTrades(trades, stats, since);
    meta.counts.afterStats = enriched.length;

    const afterThresholds = enriched.filter((bet) => meetsTraderThresholds(bet.traderStats));
    meta.counts.afterThresholds = afterThresholds.length;

    const sizeThreshold = Math.max(minBet, THRESHOLDS.minBetSizeUSD);
    meta.counts.afterMinBet = afterThresholds.filter((bet) => bet.sizeUSD >= sizeThreshold).length;

    const items = filterSmartTraders(enriched, minBet);
    meta.probe = { ok: true, variant: "trades", errors: [] };

    const payload: RecentBetsResponse = { items };
    if (debug) {
      res.status(200).json({ ...payload, meta });
      return;
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    res.status(200).json(payload);
  } catch (error: any) {
    console.error("[recent-bets] error", error);
    const message = String(error?.message || error || "Unknown error");
    if (debug) {
      meta.errors.push(message);
      res.status(500).json({ error: "Failed to fetch recent bets", meta });
      return;
    }
    res.status(500).json({ error: "Failed to fetch recent bets" });
  }
}
