import { ENV, assertNansenAccess } from './env';
import { fetchJson } from './http';
import type { SmartWallet } from './types';

const NANSEN_URL = 'https://api.nansen.ai/api/v2/wallets';
const LABELS = ['smart-money', 'smart-trader'];

let cachedWallets: SmartWallet[] | null = null;
let lastFetched = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

type NansenLabel = {
  label?: string;
  slug?: string;
  name?: string;
};

type NansenWallet = {
  address: string;
  labels?: NansenLabel[] | null;
  label?: string;
  name?: string;
};

type NansenResponse = {
  wallets?: NansenWallet[];
  items?: NansenWallet[];
  data?: {
    wallets?: NansenWallet[];
    items?: NansenWallet[];
  };
};

const MOCK_WALLETS: SmartWallet[] = Array.from({ length: 15 }).map((_, index) => ({
  address: `0xMOCKWALLET${(index + 1).toString().padStart(2, '0')}`,
  label: index % 2 === 0 ? 'Smart Money Fund' : 'Smart Trader',
}));

export async function fetchSmartWallets(): Promise<SmartWallet[]> {
  if (ENV.useMockData) {
    return MOCK_WALLETS;
  }

  assertNansenAccess();

  if (cachedWallets && Date.now() - lastFetched < CACHE_TTL_MS) {
    return cachedWallets;
  }

  const searchParams = new URLSearchParams({
    limit: '200',
  });

  LABELS.forEach((label) => searchParams.append('labels', label));

  try {
    const response = await fetchJson<NansenResponse>(`${NANSEN_URL}?${searchParams.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': ENV.nansenApiKey,
      },
    });

    const rawWallets =
      response.wallets ??
      response.items ??
      response.data?.wallets ??
      response.data?.items ??
      [];

    const wallets = rawWallets
      .filter((wallet): wallet is NansenWallet => Boolean(wallet?.address))
      .map((wallet) => {
        const labels = wallet.labels ?? [];
        const matchingLabel = labels.find((item) => {
          const value = item.label ?? item.slug ?? '';
          return LABELS.includes(value.toLowerCase());
        });

        if (!matchingLabel && wallet.label) {
          const fallbackLabel = wallet.label.toLowerCase();
          if (!LABELS.includes(fallbackLabel)) {
            return null;
          }
          return {
            address: wallet.address,
            label: wallet.name ?? wallet.label ?? 'Smart Trader',
          } satisfies SmartWallet | null;
        }

        if (!matchingLabel) {
          return null;
        }

        return {
          address: wallet.address,
          label: matchingLabel.name ?? matchingLabel.label ?? matchingLabel.slug ?? 'Smart Trader',
        } satisfies SmartWallet | null;
      })
      .filter((wallet): wallet is SmartWallet => Boolean(wallet));

    cachedWallets = wallets;
    lastFetched = Date.now();
    return wallets;
  } catch (error) {
    console.error('Failed to fetch Nansen smart wallets', error);
    throw error;
  }
}

export function getMockWallets() {
  return MOCK_WALLETS;
}
