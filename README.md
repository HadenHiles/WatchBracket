# Watch Bracket

Watch Bracket is a self-hosted, real-time party lobby for turning “what should we watch?” into a shared game. This repository currently implements Milestones 0 through 2: household-host authentication, durable lobby rooms, guest presence and restoration, locking, securely paired browser displays, and the Chromecast couch-display path.

Media search, nominations, recommendations, voting, tournament logic, and provider integrations are deliberately not implemented yet. Google Cast launching requires a registered Custom Web Receiver application ID and a registered physical test device; see `docs/cast/MILESTONE-2.md`.

## Local prerequisites

- Node.js 22.9 or newer
- pnpm 10.34 or newer (pnpm 11 requires Node.js 22.13+)
- Docker Engine with Docker Compose v2 for the full stack

Copy `.env.example` to a private environment file only when running services outside Compose. Never commit the resulting file.

## Start locally

The one-command container path includes PostgreSQL migrations:

```sh
pnpm install --frozen-lockfile
pnpm compose:dev
```

Open `http://localhost:3000`. The development bootstrap account is `host@example.com` / `correct-horse-battery-staple`; it is intentionally limited to the loopback-only development Compose file.

For process-level development, start PostgreSQL, export the variables in `.env.example`, then run:

```sh
pnpm db:migrate
pnpm dev
```

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
TEST_DATABASE_URL=postgres://... pnpm test:integration
E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
pnpm build
pnpm compose:prod:config
```

Integration tests require a real, migrated PostgreSQL database and fail clearly rather than replacing it with memory-backed persistence.

## Architecture

- `apps/web`: Next.js App Router mobile controller and browser display
- `apps/game-api`: Fastify, Socket.IO, authoritative room state, and expiration scheduler
- `apps/integration-service`: private Fastify boundary with explicit unimplemented provider operations
- `apps/cast-receiver`: Vite-built Custom Web Receiver and deterministic receiver test mode
- `packages/db`: Drizzle schema and migration; PostgreSQL is durable truth
- `packages/realtime-protocol` and `packages/display-protocol`: versioned Zod contracts

Browsers access one public origin through Caddy. Only the game API reaches PostgreSQL. Display sessions are room-scoped, read-only, independently reconnectable, and revocable.

The Cast sender passes only a single-use launch token over the custom namespace. The receiver exchanges it once and then connects directly to the game API using an in-memory display bearer token. Set `CAST_RECEIVER_APP_ID` at web build time after completing Google Cast registration.

See [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), and the complete [product specification](docs/SPEC.md).
