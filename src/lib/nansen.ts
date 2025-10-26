export type SmartWallet = { address: string; label: string };

const DEFAULT_NANSEN_KEY = "V6c71knCptYFsYpDMzV6KAszKjIedHCg";

function getNansenKey(): string {
  return process.env.NANSEN_API_KEY?.trim() || DEFAULT_NANSEN_KEY;
}

export async function getSmartWallets(): Promise<SmartWallet[]> {
  const apiKey = getNansenKey();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = "https://api.nansen.ai/wallets/smart-money";
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json().catch(() => null);
    const wallets = Array.isArray(data?.wallets) ? data.wallets : [];

    const seen = new Set<string>();
    const normalized: SmartWallet[] = [];

    for (const entry of wallets) {
      const address = String(entry?.address ?? "").toLowerCase();
      if (!address || seen.has(address)) {
        continue;
      }
      seen.add(address);
      const label = entry?.label ? String(entry.label) : "Smart Money • Nansen";
      normalized.push({ address, label });
    }

    return normalized;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export function hasNansenKey(): boolean {
  return Boolean(process.env.NANSEN_API_KEY?.trim() || DEFAULT_NANSEN_KEY);
}
