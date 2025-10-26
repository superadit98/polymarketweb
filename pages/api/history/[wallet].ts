import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl } from "@/lib/env";
import { fetchWalletHistory } from "@/lib/poly";
import type { WalletHistoryResponse } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase();
    if (!wallet) {
      res.status(400).json({ error: "wallet is required" });
      return;
    }

    const polyBase = getPolyUrl();
    if (!polyBase) {
      res.status(500).json({ error: "Polymarket data API base URL is not configured" });
      return;
    }

    const history = await fetchWalletHistory(wallet);
    const payload: WalletHistoryResponse = { ...history };

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    res.status(200).json(payload);
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message || error) });
  }
}
