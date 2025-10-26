import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl, hasConfiguredPoly, getNansenKey, inMockMode } from "@/lib/env";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const polyConfigured = hasConfiguredPoly();
  const nansenConfigured = Boolean(getNansenKey());
  res.status(200).json({
    env: {
      POLY_SUBGRAPH_URL: polyConfigured,
      NANSEN_API_KEY: nansenConfigured,
    },
    effective: {
      polyUrl: getPolyUrl(),
      mockMode: inMockMode(),
    },
    note: "If POLY_SUBGRAPH_URL shows false, set it in Vercel project Settings → Environment Variables, then redeploy.",
  });
}
