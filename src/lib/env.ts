const DEFAULT_POLY =
  "https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn";

export function getPolyUrl(): string | null {
  const raw = process.env.POLY_SUBGRAPH_URL?.trim();
  if (raw && raw.startsWith("http")) return raw;
  // Fallback: comment this line if you want *strict* env only
  return DEFAULT_POLY;
}

export function hasConfiguredPoly(): boolean {
  const raw = process.env.POLY_SUBGRAPH_URL?.trim();
  return Boolean(raw && raw.startsWith("http"));
}

export function getNansenKey(): string | null {
  return process.env.NANSEN_API_KEY?.trim() || null;
}

export function inMockMode(): boolean {
  // true if either key is missing (useful for local preview)
  return !getNansenKey();
}
