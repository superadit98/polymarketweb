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
```

When these keys are missing the server automatically falls back to rich mock data. You can explicitly opt in to mock mode with `USE_MOCK_DATA=1`.

## Getting started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

To preview the experience without API keys, run:

```bash
npm run dev:mock
```

This sets `USE_MOCK_DATA=1` so the API endpoints return seeded mock responses.

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Next.js in development mode. |
| `npm run dev:mock` | Start the app in mock mode with generated data. |
| `npm run build` | Build the production bundle. |
| `npm run start` | Run the production server. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Execute Vitest unit tests. |

## Testing

Vitest covers data shaping utilities such as win-rate computation, threshold gating, and bet sorting. Run `npm run test` to execute the suite.

## API endpoints

- `GET /api/recent-bets?minBet=500` — returns a filtered list of recent high-value bets from smart wallets.
- `GET /api/history/:wallet` — returns closed and pending trades for a specific wallet.

Both endpoints cache responses for 60 minutes via HTTP caching headers and ETags.

## Project structure

```
app/
  api/          # Next.js API routes
  page.tsx      # Single-page dashboard UI
lib/
  env.ts        # Environment helpers
  nansen.ts     # Smart wallet fetching & mocks
  poly.ts       # Polymarket subgraph helpers & mocks
  service.ts    # Aggregation and filtering logic
  stats.ts      # Thresholds & calculations
```

## Linting & formatting

The project ships with ESLint (Next.js config) and Prettier 3. Run `npm run lint` before committing changes.

