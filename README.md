# Polymarket Smart Traders

A minimal dashboard that surfaces high-conviction Polymarket activity from Nansen-verified smart trader wallets.

## Requirements

- Node.js 18+
- Yarn or npm

## Environment variables

Create a `.env.local` file for local development:

```
NANSEN_API_KEY=your-nansen-api-key
POLY_SUBGRAPH_URL=https://your-goldsky-polymarket-subgraph
POLY_REST_BASE=https://polymarket.com/api # optional override
LOG_LEVEL=info
```

Both the Nansen and Polymarket subgraph keys must be present for live data. If either is missing the API endpoints return a `200` response with an empty list and the `X-Mock: 1` header so the UI stays functional.

## Getting started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Next.js in development mode. |
| `npm run build` | Build the production bundle. |
| `npm run start` | Run the production server. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Execute Vitest unit tests. |
| `npm run probe` | Call `/api/debug` (requires the dev server running) and print the diagnostics payload. |

## Testing

Vitest covers data shaping utilities such as win-rate computation, threshold gating, and bet sorting. Run `npm run test` to execute the suite.

## API endpoints

- `GET /api/recent-bets?minBet=500` — returns a filtered list of recent high-value bets from smart wallets.
- `GET /api/history/:wallet` — returns closed and pending trades for a specific wallet.

Both endpoints cache responses for 60 minutes via HTTP caching headers and ETags.

## Project structure

```
app/
  page.tsx      # Single-page dashboard UI
pages/api/
  debug.ts               # Connectivity probe for support/debugging
  recent-bets.ts         # REST endpoint for high-value bets
  history/[wallet].ts    # REST endpoint for per-wallet history
src/
  lib/
    env.ts               # Environment bootstrap + logging level
    log.ts               # Lightweight logger
  server/
    http.ts              # Fetch helper with retries/timeouts
    nansen.ts            # Smart wallet ingestion
    poly.ts              # Polymarket data aggregation & probes
    stats.ts             # Win-rate + filter helpers
  types.ts               # Shared server/client DTOs
```

## Linting & formatting

The project ships with ESLint (Next.js config) and Prettier 3. Run `npm run lint` before committing changes.

## Deployment

Deploying to Vercel requires setting `NANSEN_API_KEY` and `POLY_SUBGRAPH_URL` (plus optional `POLY_REST_BASE`) in the Vercel dashboard (Project Settings → Environment Variables). Once configured, redeploy with:

```bash
vercel deploy --prod
```

After deploying you can hit `/api/debug` to confirm connectivity—successful probes will report `subgraphProbe.ok` and `restProbe.ok` as `true`.

