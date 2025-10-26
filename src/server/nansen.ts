import { logger } from '@/lib/log';
import { env, hasNansen } from '@/lib/env';
import { fetchJson } from './http';

type SmartWallet = { address: string; label: string };

type NansenWalletEntry = {
  address?: string;
  wallet?: string;
  walletAddress?: string;
  name?: string;
  label?: string;
  labels?: Array<{ name?: string }>;
};

type NansenResponse = {
  items?: NansenWalletEntry[];
  wallets?: NansenWalletEntry[];
  data?: {
    items?: NansenWalletEntry[];
    wallets?: NansenWalletEntry[];
  };
  nextCursor?: string | null;
  cursor?: string | null;
};

const SMART_KEYWORDS = ['smart money', 'smart trader'];
const BASE_URL = 'https://api.nansen.ai/api/v1';

function isSmartLabel(label: string | undefined | null) {
  if (!label) return false;
  const lower = label.toLowerCase();
  return SMART_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function normaliseEntry(entry: NansenWalletEntry): SmartWallet | null {
  const address =
    entry.address?.trim() ||
    entry.wallet?.trim() ||
    entry.walletAddress?.trim();
  if (!address) {
    return null;
  }

  const candidateLabels: string[] = [];
  if (typeof entry.label === 'string') {
    candidateLabels.push(entry.label);
  }
  if (Array.isArray(entry.labels)) {
    for (const label of entry.labels) {
      if (label?.name) {
        candidateLabels.push(label.name);
      }
    }
  }
  if (entry.name) {
    candidateLabels.push(entry.name);
  }

  const selectedLabel = candidateLabels.find((label) => isSmartLabel(label));
  if (!selectedLabel) {
    return null;
  }

  return {
    address: address.toLowerCase(),
    label: selectedLabel,
  };
}

export async function fetchSmartWallets(): Promise<SmartWallet[]> {
  if (!hasNansen) {
    throw new Error('Nansen API key missing');
  }

  const headers = {
    Authorization: `Bearer ${env.nansenApiKey}`,
  };

  const wallets = new Map<string, SmartWallet>();
  let cursor: string | undefined;
  let page = 0;

  do {
    page += 1;
    const endpoint = cursor
      ? `${BASE_URL}/smart-money/wallets?cursor=${encodeURIComponent(cursor)}`
      : `${BASE_URL}/smart-money/wallets`;

    const result = await fetchJson<NansenResponse>(endpoint, {
      method: 'GET',
      headers,
      source: 'nansen',
      endpoint,
      wallet: undefined,
    });

    if (!result.ok || !result.data) {
      const error = result.error ?? 'Unknown Nansen response';
      logger.error('[nansen] failed to fetch smart wallets', { error, page });
      throw new Error(error);
    }

    const payload = result.data;
    const entries = (
      payload.items ||
      payload.wallets ||
      payload.data?.items ||
      payload.data?.wallets ||
      []
    ).filter(Boolean);

    for (const entry of entries) {
      const wallet = normaliseEntry(entry);
      if (wallet) {
        if (!wallets.has(wallet.address)) {
          wallets.set(wallet.address, wallet);
        }
      }
    }

    cursor = payload.nextCursor ?? payload.cursor ?? undefined;

    if (!cursor) {
      break;
    }
  } while (wallets.size < 200);

  logger.info('[nansen] fetched smart wallets', { count: wallets.size });
  return Array.from(wallets.values());
}
