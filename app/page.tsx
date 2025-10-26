'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCcw, Search } from 'lucide-react';

type TraderStats = {
  totalTrades: number;
  largestWinUSD: number;
  positionValueUSD: number;
  realizedPnlUSD: number;
  winRate: number;
};

type RecentBet = {
  wallet: string;
  label: string;
  outcome: 'YES' | 'NO';
  sizeUSD: number;
  price: number;
  marketId: string;
  marketQuestion: string;
  marketUrl: string;
  traderStats: TraderStats;
  timestamp: number;
};

type HistoryRow = {
  marketId: string;
  marketQuestion: string;
  outcome: 'YES' | 'NO';
  sizeUSD: number;
  price: number;
  result: 'Win' | 'Loss' | 'Pending';
  pnlUSD: number;
  marketUrl: string;
  closedAt?: number | null;
};

type WalletHistory = {
  wallet: string;
  label: string;
  winRate: number;
  rows: HistoryRow[];
};

const REFRESH_INTERVAL = 60 * 60 * 1000;
const DEFAULT_MIN_BET = 500;
const MAX_WALLETS = 50;

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number) {
  if (Number.isNaN(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

export default function HomePage() {
  const [bets, setBets] = useState<RecentBet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<WalletHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchBets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/recent-bets?minBet=${DEFAULT_MIN_BET}`);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const json = (await response.json()) as RecentBet[];
      setBets(Array.isArray(json) ? json.slice(0, MAX_WALLETS) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (wallet: string, label: string) => {
    setHistoryLoading(true);
    setHistoryError(null);
    setSelected({ wallet, label, winRate: 0, rows: [] });
    try {
      const response = await fetch(`/api/history/${wallet}`);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const json = (await response.json()) as WalletHistory;
      setSelected(json);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBets();
    const id = setInterval(fetchBets, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchBets]);

  const filteredBets = useMemo(() => {
    if (!search) return bets;
    const query = search.toLowerCase();
    return bets.filter((bet) =>
      [bet.wallet, bet.label, bet.marketQuestion].some((field) =>
        field.toLowerCase().includes(query),
      ),
    );
  }, [bets, search]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-polymarket-blue">
            Polymarket Smart Traders
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            High conviction bets from Nansen smart money wallets
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            We track smart traders curated by Nansen and surface only their highest conviction
            Polymarket positions. Every trade listed here already passed strict profitability
            filters and represents a bet over ${DEFAULT_MIN_BET.toLocaleString()}.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm md:max-w-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search wallet, label, or market"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={fetchBets}
            className="inline-flex items-center gap-2 rounded-full bg-polymarket-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-polymarket-blueDark disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </header>

      <section className="grid gap-4">
        {loading && bets.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Loading recent bets…
          </div>
        ) : filteredBets.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            No bets match your filters right now. Try refreshing later.
          </div>
        ) : (
          filteredBets.map((bet) => (
            <article
              key={`${bet.wallet}-${bet.marketId}-${bet.timestamp}-${bet.sizeUSD}`}
              className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition hover:border-polymarket-blue/50"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-polymarket-blue">
                    <button
                      type="button"
                      onClick={() => loadHistory(bet.wallet, bet.label)}
                      className="rounded-full bg-polymarket-blue/10 px-3 py-1 text-xs uppercase tracking-wide text-polymarket-blue transition hover:bg-polymarket-blue/20"
                    >
                      {bet.label || 'Smart Trader'}
                    </button>
                    <span className="text-xs text-slate-500">{bet.wallet}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900">{bet.marketQuestion}</h2>
                  <p className="text-sm text-slate-500">{formatDate(bet.timestamp)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={bet.marketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-polymarket-blue/40 px-3 py-1 text-xs font-semibold text-polymarket-blue transition hover:bg-polymarket-blue/10"
                  >
                    View Market
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="grid gap-4 rounded-lg bg-slate-50 p-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-slate-500">Outcome</p>
                  <p className="text-base font-semibold text-slate-900">{bet.outcome}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Size</p>
                  <p className="text-base font-semibold text-slate-900">{formatUsd(bet.sizeUSD)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Price</p>
                  <p className="text-base font-semibold text-slate-900">{(bet.price * 100).toFixed(1)}¢</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Win Rate</p>
                  <p className="text-base font-semibold text-slate-900">
                    {formatPercent(bet.traderStats.winRate)}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                <StatsItem label="Total Trades" value={bet.traderStats.totalTrades.toLocaleString()} />
                <StatsItem label="Largest Win" value={formatUsd(bet.traderStats.largestWinUSD)} />
                <StatsItem label="Position Value" value={formatUsd(bet.traderStats.positionValueUSD)} />
                <StatsItem label="Realized PnL" value={formatUsd(bet.traderStats.realizedPnlUSD)} />
              </div>
            </article>
          ))
        )}
      </section>

      {selected ? (
        <HistoryModal
          onClose={() => setSelected(null)}
          data={selected}
          isLoading={historyLoading}
          error={historyError}
        />
      ) : null}
    </main>
  );
}

function StatsItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function HistoryModal({
  data,
  onClose,
  isLoading,
  error,
}: {
  data: WalletHistory;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-10">
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-polymarket-blue">
              {data.label}
            </p>
            <h3 className="text-xl font-semibold text-slate-900">{data.wallet}</h3>
            <p className="text-sm text-slate-500">Win rate {formatPercent(data.winRate)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="flex flex-col gap-0 divide-y divide-slate-100 overflow-y-auto p-0 scrollbar-thin">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">Loading trade history…</p>
          ) : error ? (
            <p className="p-6 text-sm text-red-600">{error}</p>
          ) : data.rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No trade history available.</p>
          ) : (
            data.rows.map((row) => (
              <div key={`${row.marketId}-${row.marketUrl}-${row.closedAt ?? 'open'}`} className="flex flex-col gap-3 p-5">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{row.marketQuestion}</p>
                    <p className="text-xs text-slate-500">Outcome {row.outcome}</p>
                  </div>
                  <a
                    href={row.marketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-polymarket-blue hover:underline"
                  >
                    View Market
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
                <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase">Size</p>
                    <p className="text-sm font-semibold text-slate-900">{formatUsd(row.sizeUSD)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase">Result</p>
                    <p
                      className={`text-sm font-semibold ${
                        row.result === 'Win'
                          ? 'text-green-600'
                          : row.result === 'Loss'
                            ? 'text-red-600'
                            : 'text-slate-900'
                      }`}
                    >
                      {row.result}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase">PnL</p>
                    <p
                      className={`text-sm font-semibold ${
                        row.pnlUSD > 0
                          ? 'text-green-600'
                          : row.pnlUSD < 0
                            ? 'text-red-600'
                            : 'text-slate-900'
                      }`}
                    >
                      {formatUsd(row.pnlUSD)}
                    </p>
                  </div>
                </div>
                <div className="text-[11px] uppercase text-slate-400">
                  {row.closedAt ? `Closed ${formatDate(row.closedAt)}` : 'Pending'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
