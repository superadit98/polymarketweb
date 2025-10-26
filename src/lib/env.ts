import { logger } from './log';

type AppEnv = {
  nansenApiKey: string;
  polySubgraphUrl: string;
  polyRestBase: string;
  logLevel: string;
};

const nansenApiKey = process.env.NANSEN_API_KEY?.trim() ?? '';
const polySubgraphUrl = process.env.POLY_SUBGRAPH_URL?.trim() ?? '';
const polyRestBase = (process.env.POLY_REST_BASE?.trim() ?? 'https://polymarket.com/api').replace(/\/$/, '');
const logLevel = process.env.LOG_LEVEL?.trim() ?? 'info';

export const env: AppEnv = {
  nansenApiKey,
  polySubgraphUrl,
  polyRestBase,
  logLevel,
};

export const hasNansen = nansenApiKey.length > 0;
export const hasPolySubgraph = polySubgraphUrl.length > 0;

logger.setLevel(logLevel);

const bootLogKey = Symbol.for('smartTraders.envLogged');
const bootStore = globalThis as typeof globalThis & {
  [bootLogKey]?: boolean;
};

if (!bootStore[bootLogKey]) {
  bootStore[bootLogKey] = true;
  logger.info('[env] configuration loaded', {
    hasNansen,
    hasPolySubgraph,
    polyRestBase,
    logLevel,
  });
}

export function requireEnv(name: keyof AppEnv) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
