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

function extractWallets(response: NansenResponse | null | undefined): NansenWallet[] {
  return (
    response?.wallets ??
    response?.items ??
    response?.data?.wallets ??
    response?.data?.items ??
    []
  ).filter((wallet): wallet is NansenWallet => Boolean(wallet?.address));
}

function normalizeWallet(wallet: NansenWallet, requestedLabel?: string): SmartWallet | null {
  if (!wallet?.address) {
    return null;
  }

  const labels = wallet.labels ?? [];
  const matchingLabel = labels.find((item) => {
    const slug = (item.slug ?? item.label ?? '').toLowerCase();
    return LABELS.includes(slug);
  });

  const slugCandidates = [
    matchingLabel?.label,
    matchingLabel?.slug,
    wallet.label,
    requestedLabel,
  ].filter((value): value is string => Boolean(value?.length));

  const hasValidSlug = slugCandidates.some((value) => LABELS.includes(value.toLowerCase()));
  if (!hasValidSlug) {
    return null;
  }

  const labelCandidates = [
    matchingLabel?.name,
    wallet.name,
    wallet.label,
    requestedLabel,
  ].filter((value): value is string => Boolean(value?.trim()));

  return {
    address: wallet.address,
    label: labelCandidates[0] ?? 'Smart Trader',
  } satisfies SmartWallet;
}

async function fetchWalletBatch(
  params: URLSearchParams,
  requestedLabel?: string,
): Promise<SmartWallet[]> {
  try {
    const response = await fetchJson<NansenResponse>(`${NANSEN_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': ENV.nansenApiKey,
      },
    });

    return extractWallets(response)
      .map((wallet) => normalizeWallet(wallet, requestedLabel))
      .filter((wallet): wallet is SmartWallet => Boolean(wallet));
  } catch (error) {
    console.error('Failed to fetch Nansen wallet batch', {
      label: requestedLabel ?? 'combined',
      error,
    });
    return [];
  }
}

export async function fetchSmartWallets(): Promise<SmartWallet[]> {
  if (ENV.useMockData) {
    return MOCK_WALLETS;
  }

  assertNansenAccess();

  if (cachedWallets && Date.now() - lastFetched < CACHE_TTL_MS) {
    return cachedWallets;
  }

  const combinedParams = new URLSearchParams({
    limit: '200',
    labels: LABELS.join(','),
  });

  let wallets = await fetchWalletBatch(combinedParams);

  if (wallets.length === 0) {
    const perLabel = await Promise.all(
      LABELS.map((label) =>
        fetchWalletBatch(
          new URLSearchParams({
            limit: '200',
            labels: label,
          }),
          label,
        ),
      ),
    );

    wallets = perLabel.flat();
  }

  const deduped = new Map<string, SmartWallet>();
  wallets.forEach((wallet) => {
    const key = wallet.address.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, wallet);
    }
  });

  const normalized = Array.from(deduped.values());

  if (normalized.length === 0) {
    throw new Error('Nansen did not return any smart wallets for the requested labels.');
  }

  cachedWallets = normalized;
  lastFetched = Date.now();
  return normalized;
}

export function getMockWallets() {
  return MOCK_WALLETS;
}
