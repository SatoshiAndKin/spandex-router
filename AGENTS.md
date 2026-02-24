# AGENTS.md

## Project Overview

FlashProfits Spandex Router is a DEX aggregator quote server that queries multiple swap providers (Spandex and Curve) and returns the best-priced quote for a given token pair. It includes a built-in web UI.

**Language:** TypeScript (Node.js >= 20, ESM)
**Runtime:** tsx (TypeScript execution without build step)

## Quick Start

```sh
cp env.example .env   # fill in ALCHEMY_API_KEY
npm install
npm run dev           # starts server with file watching at http://localhost:3000
```

## Commands

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Start dev server with file watch   |
| `npm start`          | Start production server            |
| `npm run typecheck`  | Type-check with tsc --noEmit       |
| `npm run lint`       | Lint with ESLint                   |
| `npm run lint:fix`   | Lint and auto-fix                  |
| `npm run format`     | Format with Prettier               |
| `npm test`           | Run tests (Vitest)                 |
| `npm run test:coverage` | Run tests with coverage         |
| `npm run dead-code`  | Detect dead code and unused exports (knip) |
| `npm run duplicates` | Detect duplicate code (jscpd)      |
| `npm run docs`       | Generate API docs (TypeDoc)        |

## Architecture

- `src/server.ts` - HTTP server, request routing, HTML UI (inline template)
- `src/config.ts` - Chain config, Spandex setup, viem clients, token metadata
- `src/curve.ts` - Curve Finance API integration (Ethereum only)
- `src/quote.ts` - Query parameter parsing and validation
- `src/env.ts` - .env file loader (imported first in server.ts)
- `src/default-tokenlist.ts` - Built-in Ethereum token list for autocomplete
- `src/logger.ts` - Structured logging with pino and log scrubbing
- `src/sentry.ts` - Sentry error tracking integration
- `src/tracing.ts` - Request ID propagation for distributed tracing
- `src/metrics.ts` - Prometheus-compatible metrics collection
- `src/feature-flags.ts` - Environment-based feature flag system

## API Endpoints

- `GET /` - Web UI
- `GET /health` - Health check
- `GET /chains` - Supported chains list
- `GET /quote` - Spandex-only quote (chainId, from, to, amount, slippageBps, sender)
- `GET /compare` - Compare Spandex vs Curve (same params as /quote)
- `GET /metrics` - Prometheus-compatible metrics endpoint

## Environment Variables

See `env.example`. Required: `ALCHEMY_API_KEY`. Optional: `ZEROX_API_KEY`, `FABRIC_API_KEY`, `RPC_URL_<chainId>`, `CURVE_ENABLED`, `COMPARE_ENABLED`, `METRICS_ENABLED`, `SENTRY_DSN`, `LOG_LEVEL`.

## Testing

Tests are in `src/__tests__/`. Run with `npm test`. Tests use Vitest with mocked external dependencies (viem, @spandex/core). Coverage threshold is 80%.

## Conventions

- All source files in `src/` directory
- Test files: `src/__tests__/*.test.ts`
- ESLint with TypeScript strict rules, Prettier formatting
- Pre-commit hooks enforce linting and formatting via Husky + lint-staged
- Structured logging with pino (JSON in production, pretty in development)
- No direct `console.log` in source code; use the logger from `src/logger.ts`
- Feature flags configured via environment variables (`src/feature-flags.ts`)
- Request tracing via `x-request-id` header propagation
- Architecture docs in `docs/architecture.md`, runbooks in `docs/runbooks/`
