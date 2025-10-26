const required = {
  nansenApiKey: process.env.NANSEN_API_KEY?.trim() || '',
  polySubgraphUrl: process.env.POLY_SUBGRAPH_URL?.trim() || '',
};

export const ENV = {
  ...required,
  useMockData: process.env.USE_MOCK_DATA === '1' || process.env.USE_MOCK_DATA === 'true',
};

export function hasExternalAccess() {
  return Boolean(required.nansenApiKey && required.polySubgraphUrl);
}
