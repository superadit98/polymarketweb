import type { NextApiRequest, NextApiResponse } from "next";
import { fetchRecentBets } from "@/lib/poly";

function clamp(value: number, { min, max }: { min: number; max: number }) {
  return Math.min(max, Math.max(min, value));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const debug = String(req.query.debug ?? "") === "1";
    const hoursRaw = Number(req.query.hours ?? 24);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? clamp(hoursRaw, { min: 1, max: 24 * 30 }) : 24;
    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? clamp(limitRaw, { min: 1, max: 200 }) : 100;
    const since = Math.max(0, Math.floor(Date.now() / 1000 - hours * 3600));

    const trades = await fetchRecentBets(limit, 0);
    const filtered = trades.filter((trade) => trade.timestamp >= since);

    const payload: Record<string, any> = {
      ok: true,
      variant: "trades",
      count: filtered.length,
      sample: filtered.slice(0, 3).map((trade) => ({
        wallet: trade.wallet,
        marketId: trade.marketId,
        sizeUSD: trade.sizeUSD,
        price: trade.price,
        timestamp: trade.timestamp,
      })),
      errors: [],
      since,
      url: "https://data-api.polymarket.com/trades",
    };

    if (!debug) {
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    }

    res.status(200).json(payload);
  } catch (error: any) {
    console.error("[probe] error", error);
    res.status(500).json({
      ok: false,
      errors: [String(error?.message || error || "Unknown error")],
    });
  }
}
