const DEFAULT_POLY = "https://data-api.polymarket.com";

function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("http")) return null;
  return trimmed.replace(/\/$/, "");
}

export function getPolyUrl(): string {
  const configured =
    normalizeUrl(process.env.POLY_API_BASE) ?? normalizeUrl(process.env.POLY_SUBGRAPH_URL);
  return configured ?? DEFAULT_POLY;
}

export function hasConfiguredPoly(): boolean {
  return Boolean(normalizeUrl(process.env.POLY_API_BASE) ?? normalizeUrl(process.env.POLY_SUBGRAPH_URL));
}

export function getNansenKey(): string | null {
  return process.env.NANSEN_API_KEY?.trim() || null;
}

export function inMockMode(): boolean {
  // true if either key is missing (useful for local preview)
  return !getNansenKey();
}
