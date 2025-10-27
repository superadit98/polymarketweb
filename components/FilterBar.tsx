"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, RefreshCw } from "lucide-react";

type FilterState = {
  minBet: number;
  hours: string;
  labels: { smart_money: boolean; smart_trader: boolean; whale: boolean };
  outcomes: { yes: boolean; no: boolean };
  sortBy: string;
  sortDir: "asc" | "desc";
  activeWithinDays: string;
  distinctMarketsMin: number;
};

type Props = {
  totalFromServer?: number;
  onApply?: (params: URLSearchParams) => void;
};

const HOURS_OPTIONS = ["6", "12", "24", "48", "72", "168"];
const ACTIVE_OPTIONS = [
  { value: "0", label: "All" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];
const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sizeUSD", label: "Size" },
  { value: "timestamp", label: "Time" },
  { value: "label", label: "Label" },
  { value: "distinctMarkets", label: "Distinct Markets" },
  { value: "betsCount", label: "Bets Count" },
];

function deriveState(sp: URLSearchParams): FilterState {
  const minBet = Number(sp.get("minBet") ?? 500);
  const hours = sp.get("hours") ?? "24";
  const labelsParam = sp.get("labels");
  const labelSet = new Set((labelsParam ?? "").split(",").filter(Boolean));
  const outcomesParam = sp.get("outcome") ?? "YES,NO";
  const outcomeSet = new Set(outcomesParam.split(",").filter(Boolean));

  return {
    minBet: Number.isFinite(minBet) ? minBet : 500,
    hours,
    labels: {
      smart_money: labelsParam ? labelSet.has("smart_money") : true,
      smart_trader: labelsParam ? labelSet.has("smart_trader") : true,
      whale: labelsParam ? labelSet.has("whale") : true,
    },
    outcomes: {
      yes: outcomeSet.size === 0 ? true : outcomeSet.has("YES"),
      no: outcomeSet.size === 0 ? true : outcomeSet.has("NO"),
    },
    sortBy: sp.get("sortBy") ?? "sizeUSD",
    sortDir: (sp.get("sortDir") === "asc" ? "asc" : "desc") as "asc" | "desc",
    activeWithinDays: sp.get("activeWithinDays") ?? "0",
    distinctMarketsMin: Number(sp.get("distinctMarketsMin") ?? 0) || 0,
  };
}

function buildParams(state: FilterState, current: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(current.toString());

  params.set("minBet", String(state.minBet));
  params.set("hours", state.hours);

  const labelsSelected: string[] = [];
  if (state.labels.smart_money) labelsSelected.push("smart_money");
  if (state.labels.smart_trader) labelsSelected.push("smart_trader");
  if (state.labels.whale) labelsSelected.push("whale");
  if (labelsSelected.length === 0 || labelsSelected.length === 3) {
    params.delete("labels");
  } else {
    params.set("labels", labelsSelected.join(","));
  }

  const outcomes: string[] = [];
  if (state.outcomes.yes) outcomes.push("YES");
  if (state.outcomes.no) outcomes.push("NO");
  if (outcomes.length === 0) {
    outcomes.push("YES", "NO");
  }
  params.set("outcome", outcomes.join(","));

  params.set("sortBy", state.sortBy);
  params.set("sortDir", state.sortDir);
  params.set("activeWithinDays", state.activeWithinDays);
  params.set("distinctMarketsMin", String(state.distinctMarketsMin));

  return params;
}

export default function FilterBar({ totalFromServer = 0, onApply }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const spKey = sp.toString();
  const [state, setState] = useState<FilterState>(() => deriveState(new URLSearchParams(spKey)));

  useEffect(() => {
    setState(deriveState(new URLSearchParams(spKey)));
  }, [spKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = buildParams(state, new URLSearchParams(spKey));
      const next = params.toString();
      if (next !== spKey) {
        router.replace(`?${next}`);
      }
      onApply?.(params);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [state, spKey, router, onApply]);

  const toggleLabel = (key: keyof FilterState["labels"]) => {
    setState((prev) => ({
      ...prev,
      labels: {
        ...prev.labels,
        [key]: !prev.labels[key],
      },
    }));
  };

  const toggleOutcome = (key: keyof FilterState["outcomes"]) => {
    setState((prev) => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        [key]: !prev.outcomes[key],
      },
    }));
  };

  const reset = () => {
    const nextState: FilterState = {
      minBet: 500,
      hours: "24",
      labels: { smart_money: true, smart_trader: true, whale: true },
      outcomes: { yes: true, no: true },
      sortBy: "sizeUSD",
      sortDir: "desc",
      activeWithinDays: "0",
      distinctMarketsMin: 0,
    };
    setState(nextState);
    const params = buildParams(nextState, new URLSearchParams());
    router.replace(`?${params.toString()}`);
    onApply?.(params);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 text-slate-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4" />
          <span>Filters</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw className="h-3 w-3" />
          <span>Server total: {totalFromServer}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Min bet (USD)</span>
          <input
            type="number"
            min={0}
            step={50}
            value={state.minBet}
            onChange={(event) => setState((prev) => ({ ...prev, minBet: Number(event.target.value || 0) }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-polymarket-blue focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Lookback window</span>
          <select
            value={state.hours}
            onChange={(event) => setState((prev) => ({ ...prev, hours: event.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-polymarket-blue focus:outline-none"
          >
            {HOURS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} hours
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Nansen labels</span>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.labels.smart_money}
                onChange={() => toggleLabel("smart_money")}
              />
              <span>Smart Money</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.labels.smart_trader}
                onChange={() => toggleLabel("smart_trader")}
              />
              <span>Smart Trader</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.labels.whale}
                onChange={() => toggleLabel("whale")}
              />
              <span>Whale</span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Outcome</span>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={state.outcomes.yes} onChange={() => toggleOutcome("yes")} />
              <span>YES</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={state.outcomes.no} onChange={() => toggleOutcome("no")} />
              <span>NO</span>
            </label>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Active within</span>
          <select
            value={state.activeWithinDays}
            onChange={(event) => setState((prev) => ({ ...prev, activeWithinDays: event.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-polymarket-blue focus:outline-none"
          >
            {ACTIVE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Min distinct markets</span>
          <input
            type="number"
            min={0}
            value={state.distinctMarketsMin}
            onChange={(event) =>
              setState((prev) => ({ ...prev, distinctMarketsMin: Number(event.target.value || 0) }))
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-polymarket-blue focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Sort by</span>
          <select
            value={state.sortBy}
            onChange={(event) => setState((prev) => ({ ...prev, sortBy: event.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-polymarket-blue focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-slate-500">Direction</span>
          <select
            value={state.sortDir}
            onChange={(event) =>
              setState((prev) => ({ ...prev, sortDir: event.target.value === "asc" ? "asc" : "desc" }))
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-polymarket-blue focus:outline-none"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}
