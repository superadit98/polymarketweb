const nansenApiKey = process.env.NANSEN_API_KEY?.trim() ?? '';
const polySubgraphUrl = process.env.POLY_SUBGRAPH_URL?.trim() ?? '';
const forcedMock = process.env.MOCK === '1' || process.env.MOCK === 'true';

export const ENV = {
  nansenApiKey,
  polySubgraphUrl,
  forcedMock,
};

export function isMockMode() {
  return forcedMock || !nansenApiKey || !polySubgraphUrl;
}

export function redact(value: string) {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}…${value.slice(-2)}`;
}
