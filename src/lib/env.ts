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

export function boolEnv(name: string, dflt = false): boolean {
  const v = process.env[name]?.trim()?.toLowerCase();
  if (!v) return dflt;
  return ["1", "true", "yes", "on"].includes(v);
}

export function getSmartWalletAllowlist(): Array<{ address: string; label: string }> {
  const raw = process.env.SMART_WALLETS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .map((pair) => {
      const [addr, label] = pair.split(":");
      return {
        address: (addr || "").toLowerCase(),
        label: label || "Smart • Allowlist",
      };
    })
    .filter((item) => Boolean(item.address));
}
