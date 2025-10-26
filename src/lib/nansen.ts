export type SmartWallet = { address: string; label: string };

const DEFAULT_NANSEN_KEY = "V6c71knCptYFsYpDMzV6KAszKjIedHCg";

function getNansenKey(): string {
  return process.env.NANSEN_API_KEY?.trim() || DEFAULT_NANSEN_KEY;
}

async function fetchWalletCategory(
  path: string,
  fallbackLabel: string,
  apiKey: string
): Promise<SmartWallet[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`https://api.nansen.ai/wallets/${path}`, {
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      return [];
    }

    const payload = await res.json().catch(() => null);
    const entries = Array.isArray(payload?.wallets)
      ? payload.wallets
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

    const normalized: SmartWallet[] = [];
    for (const item of entries) {
      const address = String(item?.address ?? item?.wallet ?? "").toLowerCase();
      if (!address) {
        continue;
      }
      const label = item?.label ? String(item.label) : fallbackLabel;
      normalized.push({ address, label });
    }

    return normalized;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getSmartWallets(): Promise<SmartWallet[]> {
  const apiKey = getNansenKey();
  const categories: Array<[string, string]> = [
    ["smart-money", "Smart Money • Nansen"],
    ["smart-traders", "Smart Trader • Nansen"],
    ["whales", "Whale • Nansen"],
  ];

  const combined: SmartWallet[] = [];
  const seen = new Set<string>();

  for (const [path, fallback] of categories) {
    const wallets = await fetchWalletCategory(path, fallback, apiKey);
    for (const wallet of wallets) {
      if (!wallet.address || seen.has(wallet.address)) {
        continue;
      }
      seen.add(wallet.address);
      combined.push(wallet);
    }
  }

  return combined;
}

export function hasNansenKey(): boolean {
  return Boolean(process.env.NANSEN_API_KEY?.trim() || DEFAULT_NANSEN_KEY);
}
