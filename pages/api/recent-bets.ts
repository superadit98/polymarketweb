import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl, hasConfiguredPoly, inMockMode, getNansenKey } from "@/lib/env";
import { postGraphQL } from "@/lib/http";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const minBet = Math.max(0, Number(req.query.minBet ?? 500));

    const polyUrl = getPolyUrl();
    if (!polyUrl || !hasConfiguredPoly()) {
      res.status(500).json({ error: "Polymarket subgraph URL is not configured" });
      return;
    }

    const SMART_QUERY = `query Ping { __typename }`;
    await postGraphQL<any>(polyUrl, SMART_QUERY);

    // TODO: Replace with your real Polymarket+Nansen logic
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    res.status(200).json([]);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
