import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl, hasConfiguredPoly } from "@/lib/env";
import { probeSubgraph } from "@/lib/polyProbe";

function parseNumber(value: unknown, fallback: number, { min, max }: { min: number; max: number }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const debug = String(req.query.debug ?? "") === "1";
    const hours = parseNumber(req.query.hours, 24, { min: 1, max: 24 * 30 });
    const limit = Math.floor(parseNumber(req.query.limit, 100, { min: 1, max: 500 }));
    const since = Math.max(0, Math.floor(Date.now() / 1000 - hours * 3600));

    const polyUrl = getPolyUrl();
    if (!polyUrl || !hasConfiguredPoly()) {
      res.status(500).json({ error: "Polymarket subgraph URL is not configured" });
      return;
    }

    const result = await probeSubgraph(polyUrl, since, limit);

    const payload: Record<string, any> = {
      ok: result.ok,
      errors: result.errors,
      since,
      url: polyUrl,
    };

    if (result.ok) {
      payload.variant = result.variant;
      payload.count = result.rows.length;
      payload.sample = result.rows.slice(0, 3).map((row) => JSON.parse(JSON.stringify(row)));
    }

    if (!debug) {
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
    }

    res.status(200).json(payload);
  } catch (error: any) {
    console.error("[probe] error", error);
    res.status(500).json({ error: String(error?.message || error) });
  }
}
