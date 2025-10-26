import type { NextApiRequest, NextApiResponse } from "next";
import { fetchWalletHistory, hasClobAccess } from "@/lib/poly";
import type { WalletHistoryResponse } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const wallet = String(req.query.wallet || "").toLowerCase();
  if (!wallet) {
    res.status(400).json({ error: "wallet is required" });
    return;
  }

  if (!hasClobAccess()) {
    res.status(404).json({ error: "POLY_API_KEY is required for wallet history" });
    return;
  }

  try {
    const history = await fetchWalletHistory(wallet);
    const payload: WalletHistoryResponse = { ...history };
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    res.status(200).json(payload);
  } catch (error: any) {
    console.error("[history] error", error);
    res.status(500).json({ error: String(error?.message || error) });
  }
}
