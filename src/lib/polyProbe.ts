import { postGraphQL } from "@/lib/http";

export type ProbeVariant = "fills" | "marketFills" | "transactions";

interface VariantConfig {
  key: ProbeVariant;
  query: string;
  selector: (data: any) => any[] | undefined;
}

const VARIANTS: VariantConfig[] = [
  {
    key: "fills",
    query: `query Recent($since: BigInt!, $limit: Int!) {
  fills(first: $limit, orderBy: matchTime, orderDirection: desc, where: { matchTime_gte: $since }) {
    id
    outcome
    size
    price
    matchTime
    makerAddress
    market { id question }
  }
}`,
    selector: (data: any) => (Array.isArray(data?.fills) ? data.fills : undefined),
  },
  {
    key: "marketFills",
    query: `query Recent($since: BigInt!, $limit: Int!) {
  marketFills(first: $limit, orderBy: matchTime, orderDirection: desc, where: { matchTime_gte: $since }) {
    id
    outcome
    size
    price
    matchTime
    makerAddress
    market { id question }
  }
}`,
    selector: (data: any) => (Array.isArray(data?.marketFills) ? data.marketFills : undefined),
  },
  {
    key: "transactions",
    query: `query Recent($since: BigInt!, $limit: Int!) {
  transactions(first: $limit, orderBy: timestamp, orderDirection: desc, where: { timestamp_gte: $since, type_in: [FILL] }) {
    id
    timestamp
    fill {
      id
      outcome
      size
      price
      makerAddress
      market { id question }
    }
  }
}`,
    selector: (data: any) =>
      Array.isArray(data?.transactions)
        ? data.transactions
            .map((entry: any) => {
              if (!entry?.fill) return null;
              return { ...entry.fill, timestamp: entry.timestamp };
            })
            .filter(Boolean)
        : undefined,
  },
];

export interface SubgraphProbeResult {
  ok: boolean;
  variant?: ProbeVariant;
  rows: any[];
  errors: string[];
}

export async function probeSubgraph(
  url: string,
  since: number,
  limit: number
): Promise<SubgraphProbeResult> {
  const errors: string[] = [];

  for (const variant of VARIANTS) {
    try {
      const response = await postGraphQL<any>(url, variant.query, { since, limit });
      if (!response || typeof response !== "object") {
        throw new Error("Empty response");
      }

      if (Array.isArray((response as any).errors) && (response as any).errors.length) {
        const messages = (response as any).errors
          .map((err: any) => err?.message || JSON.stringify(err))
          .join("; ");
        throw new Error(messages);
      }

      const data = (response as any).data;
      if (!data || typeof data !== "object") {
        throw new Error("Missing data field");
      }

      const rows = variant.selector(data);
      if (!rows) {
        throw new Error("Variant returned no array");
      }

      const normalized = rows.map((row: any) => JSON.parse(JSON.stringify(row)));
      return {
        ok: true,
        variant: variant.key,
        rows: normalized,
        errors,
      };
    } catch (error: any) {
      errors.push(`${variant.key}: ${error?.message || String(error)}`);
    }
  }

  return {
    ok: false,
    variant: undefined,
    rows: [],
    errors,
  };
}
