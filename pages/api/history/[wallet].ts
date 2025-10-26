import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl, hasConfiguredPoly } from "@/lib/env";
import { postGraphQL } from "@/lib/http";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase();
    if (!wallet) {
      res.status(400).json({ error: "wallet is required" });
      return;
    }

    const polyUrl = getPolyUrl();
    if (!polyUrl || !hasConfiguredPoly()) {
      res.status(500).json({ error: "Polymarket subgraph URL is not configured" });
      return;
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    res.status(200).json({ wallet, label: "Nansen Label", winRate: 0, rows: [] });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
