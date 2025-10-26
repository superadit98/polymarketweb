import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl, hasConfiguredPoly, getNansenKey, inMockMode } from "@/lib/env";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const polyConfigured = hasConfiguredPoly();
  const nansenConfigured = Boolean(getNansenKey());
  const polyKeyConfigured = Boolean(process.env.POLY_API_KEY?.trim());
  res.status(200).json({
    env: {
      POLY_API_BASE: polyConfigured,
      POLY_API_KEY: polyKeyConfigured,
      NANSEN_API_KEY: nansenConfigured,
    },
    effective: {
      polyUrl: getPolyUrl(),
      mockMode: inMockMode(),
    },
    note: "If POLY_API_BASE or POLY_API_KEY show false, set them in Vercel project Settings → Environment Variables, then redeploy.",
  });
}
