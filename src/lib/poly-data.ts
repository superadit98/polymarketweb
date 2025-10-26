import { jfetch } from "./http";
import { norm } from "./util/addr";

const BASE = process.env.POLY_DATA_API_BASE?.trim() || "https://data-api.polymarket.com";

export type ClosedTrade = {
  marketId: string;
  outcome: "YES" | "NO";
  sizeUSD: number;
  price: number;
  pnlUSD: number;
  closedAt?: number;
  marketQuestion?: string;
  marketUrl?: string;
};

export type Position = {
  marketId: string;
  valueUSD: number;
};

export type TraderStats = {
  totalTrades: number;
  largestWinUSD: number;
  positionValueUSD: number;
  realizedPnlUSD: number;
  winRate: number;
};

export type ProbeNote = {
  endpoint: string;
  rows: number;
  keys?: string[];
};

type MaybeArray = any[] | { data?: any[]; rows?: any[]; trades?: any[]; fills?: any[]; positions?: any[] } | null | undefined;

function firstArray(value: MaybeArray): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray((value as any).trades)) return (value as any).trades;
  if (Array.isArray((value as any).fills)) return (value as any).fills;
  if (Array.isArray((value as any).positions)) return (value as any).positions;
  return [];
}

function toNum(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function yesNo(value: unknown): "YES" | "NO" {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("NO")) return "NO";
  if (raw.includes("SELL")) return "NO";
  return "YES";
}

function toEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value > 1e9 ? Math.floor(value) : Math.floor(value);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function marketUrl(marketId?: string, slug?: string): string | undefined {
  if (slug) return `https://polymarket.com/event/${slug}`;
  if (marketId) return `https://polymarket.com/event/${marketId}`;
  return undefined;
}

export async function fetchClosedTrades(addr: string, probes?: ProbeNote[]): Promise<ClosedTrade[]> {
  const wallet = norm(addr);
  if (!wallet) return [];
  const endpoints = [
    `${BASE}/account/${wallet}/trades?state=closed&limit=1000`,
    `${BASE}/account/${wallet}/fills?closed=true&limit=1000`,
    `${BASE}/trades?address=${wallet}&state=closed&limit=1000`,
    `${BASE}/fills?address=${wallet}&closed=true&limit=1000`,
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await jfetch(endpoint);
      const rows = firstArray(data);
      if (!rows.length) continue;
      probes?.push({ endpoint, rows: rows.length, keys: Object.keys(rows[0] ?? {}) });
      return rows.map((row: any) => {
        const marketId = String(row?.marketId ?? row?.market_id ?? row?.market ?? row?.conditionId ?? "");
        const question = row?.market_question ?? row?.marketQuestion ?? row?.question;
        const slug = row?.market_slug ?? row?.marketSlug ?? row?.slug;
        const trade: ClosedTrade = {
          marketId,
          outcome: yesNo(row?.outcome ?? row?.side),
          sizeUSD: toNum(row?.size_usd ?? row?.sizeUSD ?? row?.notional_usd ?? row?.notionalUSD ?? row?.amount_usd),
          price: toNum(row?.price ?? row?.avg_price ?? row?.average_price ?? row?.avgPrice),
          pnlUSD: toNum(row?.pnl_usd ?? row?.pnlUSD ?? row?.realized_pnl_usd ?? row?.realizedPnlUSD),
          closedAt: toEpoch(row?.closed_at ?? row?.closedAt ?? row?.timestamp),
          marketQuestion: question ? String(question) : undefined,
          marketUrl: marketUrl(marketId, slug ? String(slug) : undefined),
        };
        return trade;
      });
    } catch (error) {
      // try next endpoint
    }
  }

  probes?.push({ endpoint: "closedTrades: none", rows: 0 });
  return [];
}

export async function fetchOpenPositions(addr: string, probes?: ProbeNote[]): Promise<Position[]> {
  const wallet = norm(addr);
  if (!wallet) return [];
  const endpoints = [
    `${BASE}/account/${wallet}/positions`,
    `${BASE}/positions?address=${wallet}`,
    `${BASE}/portfolio?address=${wallet}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await jfetch(endpoint);
      const rows = firstArray(data);
      if (!rows.length) continue;
      probes?.push({ endpoint, rows: rows.length, keys: Object.keys(rows[0] ?? {}) });
      return rows.map((row: any) => {
        const position: Position = {
          marketId: String(row?.marketId ?? row?.market_id ?? row?.market ?? row?.conditionId ?? ""),
          valueUSD: toNum(row?.value_usd ?? row?.valueUSD ?? row?.mark_to_market_usd ?? row?.mtm_usd ?? row?.unrealized_value_usd ?? row?.usdValue),
        };
        return position;
      });
    } catch (error) {
      // try next endpoint
    }
  }

  probes?.push({ endpoint: "positions: none", rows: 0 });
  return [];
}

export async function fetchAccountRollup(addr: string, probes?: ProbeNote[]) {
  const wallet = norm(addr);
  if (!wallet) return null;
  const endpoints = [
    `${BASE}/account/${wallet}/stats`,
    `${BASE}/account/${wallet}/performance`,
    `${BASE}/account/${wallet}/pnl`,
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await jfetch(endpoint);
      const payload = data?.data ?? data;
      if (!payload || typeof payload !== "object") continue;
      probes?.push({ endpoint, rows: 1, keys: Object.keys(payload) });
      const totalTrades = toNum((payload as any).total_trades ?? (payload as any).totalTrades ?? (payload as any).trade_count);
      const realizedPnlUSD = toNum((payload as any).realized_pnl_usd ?? (payload as any).realizedPnlUSD ?? (payload as any).realized);
      const positionValueUSD = toNum((payload as any).position_value_usd ?? (payload as any).positionValueUSD ?? (payload as any).portfolio_value_usd ?? (payload as any).exposure_usd);
      const rawWinRate = toNum((payload as any).win_rate ?? (payload as any).winRate);
      return {
        totalTrades,
        realizedPnlUSD,
        positionValueUSD,
        winRate: rawWinRate,
      };
    } catch (error) {
      // try next endpoint
    }
  }

  probes?.push({ endpoint: "rollup: none", rows: 0 });
  return null;
}

export async function computeTraderStats(addr: string, dbg?: { probes: ProbeNote[] }): Promise<TraderStats> {
  const probes: ProbeNote[] = [];
  const [closedTrades, positions, rollup] = await Promise.all([
    fetchClosedTrades(addr, probes),
    fetchOpenPositions(addr, probes),
    fetchAccountRollup(addr, probes),
  ]);

  if (dbg) {
    dbg.probes = probes;
  }

  let totalTrades = rollup?.totalTrades ?? closedTrades.length;
  if (!Number.isFinite(totalTrades) || totalTrades <= 0) {
    totalTrades = closedTrades.length;
  }

  const wins = closedTrades.filter((trade) => toNum(trade.pnlUSD) > 0);
  const losses = closedTrades.filter((trade) => toNum(trade.pnlUSD) < 0);
  const largestWinUSD = wins.length ? Math.max(...wins.map((trade) => toNum(trade.pnlUSD))) : 0;

  const realizedFromRollup = rollup?.realizedPnlUSD;
  const realizedPnlUSD =
    Number.isFinite(realizedFromRollup) && realizedFromRollup !== 0
      ? Number(realizedFromRollup)
      : closedTrades.reduce((sum, trade) => sum + toNum(trade.pnlUSD), 0);

  const positionFromRollup = rollup?.positionValueUSD;
  const positionValueUSD =
    Number.isFinite(positionFromRollup) && positionFromRollup !== 0
      ? Number(positionFromRollup)
      : positions.reduce((sum, position) => sum + toNum(position.valueUSD), 0);

  const rollupWinRate = rollup?.winRate;
  let winRate = 0;
  if (Number.isFinite(rollupWinRate) && rollupWinRate! > 0) {
    winRate = rollupWinRate! > 1 ? rollupWinRate! : rollupWinRate! * 100;
  } else {
    const totalClosed = wins.length + losses.length;
    winRate = totalClosed ? (wins.length / totalClosed) * 100 : 0;
  }

  return {
    totalTrades,
    largestWinUSD,
    positionValueUSD,
    realizedPnlUSD,
    winRate,
  };
}
