const required = {
  nansenApiKey: process.env.NANSEN_API_KEY?.trim() || '',
  polySubgraphUrl: process.env.POLY_SUBGRAPH_URL?.trim() || '',
};

export const ENV = {
  ...required,
  useMockData: process.env.USE_MOCK_DATA === '1' || process.env.USE_MOCK_DATA === 'true',
};

export function hasNansenAccess() {
  return Boolean(required.nansenApiKey);
}

export function hasPolyAccess() {
  return Boolean(required.polySubgraphUrl);
}

export function assertNansenAccess() {
  if (!hasNansenAccess()) {
    throw new Error('NANSEN_API_KEY is not configured. Set it or enable USE_MOCK_DATA.');
  }
}

export function assertPolyAccess() {
  if (!hasPolyAccess()) {
    throw new Error('POLY_SUBGRAPH_URL is not configured. Set it or enable USE_MOCK_DATA.');
  }
}
