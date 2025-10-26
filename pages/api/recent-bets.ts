import type { NextApiRequest, NextApiResponse } from "next";
import { getPolyUrl, hasConfiguredPoly } from "@/lib/env";
import { probeSubgraph } from "@/lib/polyProbe";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debug = String(req.query.debug ?? "") === "1";
  const minBet = Math.max(0, Number(req.query.minBet ?? 500));
  const hoursRaw = Number(req.query.hours ?? 24);
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 24 * 30) : 24;

  const meta: {
    hours: number;
    minBet: number;
    probe: { ok: boolean; variant?: string; errors: string[] };
    counts: {
      nansenWallets: number;
      subgraphRows: number;
      afterSmart: number;
      afterMinBet: number;
    };
    errors: string[];
  } = {
    hours,
    minBet,
    probe: { ok: false, errors: [] },
    counts: { nansenWallets: 0, subgraphRows: 0, afterSmart: 0, afterMinBet: 0 },
    errors: [],
  };

  try {
    const polyUrl = getPolyUrl();
    if (!polyUrl || !hasConfiguredPoly()) {
      res.status(500).json({ error: "Polymarket subgraph URL is not configured" });
      return;
    }

    const since = Math.max(0, Math.floor(Date.now() / 1000 - hours * 3600));
    const probeResult = await probeSubgraph(polyUrl, since, 100);

    meta.probe = {
      ok: probeResult.ok,
      variant: probeResult.variant,
      errors: probeResult.errors,
    };

    if (!probeResult.ok) {
      meta.errors.push("Subgraph probe failed");
      if (debug) {
        res.status(500).json({ error: "Subgraph query failed", meta });
      } else {
        res.status(500).json({ error: "Subgraph query failed" });
      }
      return;
    }

    meta.counts.subgraphRows = probeResult.rows.length;

    const items: any[] = [];
    meta.counts.afterSmart = items.length;
    meta.counts.afterMinBet = items.length;

    if (!debug) {
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
      res.status(200).json(items);
      return;
    }

    res.status(200).json({ items, meta });
  } catch (error: any) {
    console.error("[recent-bets] error", error);
    if (debug) {
      res.status(500).json({ error: String(error?.message || error), meta });
    } else {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
}
