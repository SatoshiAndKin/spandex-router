# Architecture

## Overview

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│   Browser    │────▶│           HTTP Server (server.ts)        │
│   (Web UI)   │◀────│  ┌─────────┐ ┌──────────┐ ┌──────────┐ │
└─────────────┘     │  │ /quote  │ │ /compare │ │ /metrics │ │
                    │  └────┬────┘ └─────┬────┘ └──────────┘ │
                    └───────┼────────────┼───────────────────┘
                            │            │
                    ┌───────▼────┐  ┌────▼────────────────┐
                    │  Spandex   │  │  Quote Comparison   │
                    │  (core)    │  │  Engine              │
                    └───────┬────┘  └────┬───────┬────────┘
                            │            │       │
                    ┌───────▼────┐  ┌────▼──┐ ┌─▼──────┐
                    │  Provider  │  │Spandex│ │ Curve  │
                    │  Router    │  │ Quote │ │ Quote  │
                    └───────┬────┘  └───────┘ └────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         ┌────▼───┐   ┌────▼───┐   ┌─────▼────┐
         │  0x    │   │ Odos   │   │ KyberSwap│  ...
         └────────┘   └────────┘   └──────────┘
```

## Request Flow

1. Client sends GET `/quote` or `/compare` with token pair parameters
2. Server parses and validates query parameters (`quote.ts`)
3. Config module provides chain-specific viem clients and router setup (`config.ts`)
4. For `/quote`: Spandex router aggregates across configured providers (0x, Fabric, Odos, etc.)
5. For `/compare`: Spandex and Curve routers are queried in parallel, results compared side-by-side
6. Response includes quotes from each router with pricing, routes, and gas cost comparison
7. Request ID propagated via `x-request-id` header for distributed tracing

## Modules

| Module | Responsibility |
|--------|---------------|
| `server.ts` | HTTP routing, HTML UI, request handling |
| `config.ts` | Chain config, viem clients, router setup (Spandex + providers), token metadata |
| `quote.ts` | Query parameter parsing and validation |
| `curve.ts` | Curve Finance API integration (Ethereum only) |
| `logger.ts` | Structured logging with log scrubbing |
| `sentry.ts` | Error tracking with Sentry |
| `tracing.ts` | Request ID propagation |
| `metrics.ts` | Prometheus-compatible metrics collection |
| `env.ts` | .env file loader |

## Data Flow

- **Token metadata**: Fetched on-demand from chain via viem `readContract`
- **Spandex quotes**: Real-time aggregation across multiple providers via Spandex core library
- **Curve quotes**: Direct Curve SDK integration for Ethereum pools
- **Token lists**: Built-in Ethereum token list, user-configurable via UI
- **Comparison**: Parallel router queries with side-by-side result presentation
