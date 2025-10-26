import { ENV, isMockMode } from './env';
import { fetchJson } from './http';
import type { SmartWallet } from '../types';

const NANSEN_URL = 'https://api.nansen.ai/api/v2/wallets';
const SMART_LABELS = ['smart-money', 'smart-trader'];

export type SmartWalletResult = {
  wallets: SmartWallet[];
  mock: boolean;
  error?: string;
};

type NansenWallet = {
  address?: string;
  labels?: Array<{ label?: string | null; slug?: string | null; name?: string | null }>;
  label?: string | null;
  name?: string | null;
};

type NansenResponse = {
  wallets?: NansenWallet[];
  items?: NansenWallet[];
  data?: {
    wallets?: NansenWallet[];
    items?: NansenWallet[];
  };
};

const MOCK_WALLETS: SmartWallet[] = [
  { address: '0xMockAlphaOne', label: 'Smart Money Collective' },
  { address: '0xMockAlphaTwo', label: 'Velocity Fund' },
  { address: '0xMockAlphaThree', label: 'Catalyst Desk' },
  { address: '0xMockAlphaFour', label: 'Sentiment Labs' },
  { address: '0xMockAlphaFive', label: 'Momentum Pool' },
  { address: '0xMockAlphaSix', label: 'Conviction Capital' },
  { address: '0xMockAlphaSeven', label: 'Oracle Ops' },
  { address: '0xMockAlphaEight', label: 'Signals Syndicate' },
  { address: '0xMockAlphaNine', label: 'Navigator Trading' },
  { address: '0xMockAlphaTen', label: 'Deep Liquidity' },
  { address: '0xMockAlphaEleven', label: 'Probability House' },
  { address: '0xMockAlphaTwelve', label: 'Insight Labs' },
];

function extractWallets(response: NansenResponse | null | undefined): NansenWallet[] {
  return (
    response?.wallets ??
    response?.items ??
    response?.data?.wallets ??
    response?.data?.items ??
    []
  ).filter((wallet): wallet is NansenWallet => Boolean(wallet));
}

function normalizeWallet(wallet: NansenWallet): SmartWallet | null {
  if (!wallet.address) {
    return null;
  }

  const labelEntries = wallet.labels ?? [];
  const hasSmartLabel = labelEntries.some((entry) => {
    const slug = (entry.slug ?? entry.label ?? '').toLowerCase();
    return SMART_LABELS.includes(slug);
  });

  const fallbackSlug = (wallet.label ?? '').toLowerCase();
  if (!hasSmartLabel && !SMART_LABELS.includes(fallbackSlug)) {
    return null;
  }

  const label =
    labelEntries.find((entry) => entry.name)?.name ??
    wallet.name ??
    wallet.label ??
    'Smart Trader';

  return {
    address: wallet.address,
    label,
  };
}

export function getMockWallets(): SmartWallet[] {
  return MOCK_WALLETS;
}

export async function getSmartWallets(): Promise<SmartWalletResult> {
  if (isMockMode()) {
    return { wallets: MOCK_WALLETS, mock: true };
  }

  if (!ENV.nansenApiKey) {
    return { wallets: MOCK_WALLETS, mock: true, error: 'NANSEN_API_KEY missing' };
  }

  const params = new URLSearchParams({
    limit: '200',
    labels: SMART_LABELS.join(','),
  });

  const result = await fetchJson<NansenResponse>(`${NANSEN_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-KEY': ENV.nansenApiKey,
    },
  });

  if (!result.ok) {
    console.error('[nansen] request failed', { message: result.error });
    return { wallets: MOCK_WALLETS, mock: true, error: result.error };
  }

  const normalized = extractWallets(result.data)
    .map(normalizeWallet)
    .filter((wallet): wallet is SmartWallet => Boolean(wallet));

  const deduped = Array.from(
    new Map(normalized.map((wallet) => [wallet.address.toLowerCase(), wallet])).values(),
  );

  return {
    wallets: deduped,
    mock: false,
  };
}
