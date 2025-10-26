import { randomUUID } from 'node:crypto';

import type { NextApiRequest, NextApiResponse } from 'next';

import { env, hasNansen, hasPolySubgraph } from '@/lib/env';
import { logger } from '@/lib/log';
import { probeRest, probeSubgraph } from '@/server/poly';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = randomUUID();
  res.setHeader('x-request-id', requestId);

  try {
    const envSeen = ['NANSEN_API_KEY', 'POLY_SUBGRAPH_URL'].filter((key) =>
      Boolean(process.env[key]),
    );

    const subgraphProbe = hasPolySubgraph ? await probeSubgraph() : { ok: false, error: 'Disabled' };
    const restProbe = await probeRest();

    res.status(200).json({
      requestId,
      hasNansen,
      hasPolySubgraph,
      envSeen,
      subgraphProbe,
      restProbe,
      polyRestBase: env.polyRestBase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[debug] probe failed', { requestId, message });
    res.status(500).json({
      code: 'debug_probe_error',
      message,
    });
  }
}
