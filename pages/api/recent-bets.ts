import type { NextApiRequest, NextApiResponse } from "next";
import { fetchRecentBets } from "@/lib/poly";
import type { RecentBetsResponse } from "@/types";

function clampNumber(value: unknown, fallback: number, { min, max }: { min: number; max: number }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debug = String(req.query.debug ?? "") === "1";
  const minBet = clampNumber(req.query.minBet, 500, { min: 0, max: 1_000_000 });
  const limit = clampNumber(req.query.limit, 50, { min: 1, max: 200 });

  try {
    const items = await fetchRecentBets(limit, minBet);
    const payload: RecentBetsResponse = { items };

    if (!debug) {
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    }

    res.status(200).json(payload);
  } catch (error: any) {
    console.error("[recent-bets] error", error);
    res.status(500).json({ error: String(error?.message || error) });
  }
}
