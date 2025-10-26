import { ENV, assertNansenAccess } from './env';
import { fetchJson } from './http';
import type { SmartWallet } from './types';

const NANSEN_URL = 'https://api.nansen.ai/api/v2/wallets';
const LABELS = ['smart-money', 'smart-trader'];

let cachedWallets: SmartWallet[] | null = null;
let lastFetched = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

type NansenResponse = {
  wallets: Array<{
    address: string;
    labels: Array<{
      label: string;
      name?: string;
    }>;
  }>;
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

    const wallets = response.wallets
      .filter((wallet) =>
        wallet.labels.some((label) => LABELS.includes(label.label.toLowerCase())),
      )
      .map((wallet) => {
        const label = wallet.labels.find((item) => LABELS.includes(item.label.toLowerCase()));
        return {
          address: wallet.address,
          label: label?.name || label?.label || 'Smart Trader',
        } satisfies SmartWallet;
      });

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
