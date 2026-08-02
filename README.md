# Watch Bracket

Watch Bracket is a self-hosted, real-time party game for turning “what should we watch?” into a shared decision. V1 implements Milestones 0 through 9: NAS deployment and onboarding, durable realtime rooms, browser and Chromecast displays, private nominations, the complete Double-Take tournament, TMDB/Plex/Tautulli/Seerr-compatible integrations, winner actions, household memory, replay, animated presentation, accessibility, and production hardening.

![Watch Bracket winner presentation](docs/assets/demo-winner.png)

TMDB search and wildcard generation run exclusively through the private integration service. Development and test environments retain the deterministic local catalog as an explicit offline fallback; production never silently fills a bracket with fallback titles that bypass room filters. Google Cast launching requires a registered Custom Web Receiver application ID and a registered physical test device; see `docs/cast/MILESTONE-2.md`.

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
- `apps/integration-service`: private Fastify boundary for narrow, typed TMDB, Plex, Tautulli, and Seerr-compatible operations
- `packages/mock-catalog`: deterministic provider-free catalog used by tests and development fallback only
- `packages/tournament-engine`: pure deterministic 8-, 12-, and 16-title Double-Take rules
- `apps/cast-receiver`: Vite-built Custom Web Receiver and deterministic receiver test mode
- `packages/db`: Drizzle schema and migration; PostgreSQL is durable truth
- `packages/realtime-protocol` and `packages/display-protocol`: versioned Zod contracts

Browsers access one public origin through Caddy. Only the game API reaches PostgreSQL. Display sessions are room-scoped, read-only, independently reconnectable, and revocable.

The Cast sender passes only a single-use launch token over the custom namespace. The receiver exchanges it once and then connects directly to the game API using an in-memory display bearer token. Set `CAST_RECEIVER_APP_ID` at web build time after completing Google Cast registration.

See the [NAS quick start](docs/NAS-QUICKSTART.md), [deployment guide](docs/DEPLOYMENT.md), [backup/restore runbook](docs/BACKUP-RESTORE.md), [security model](docs/SECURITY.md), [roadmap](docs/ROADMAP.md), and complete [product specification](docs/SPEC.md).

Implementation notes are tracked per phase in [Milestone 6](docs/MILESTONE-6.md), [Milestone 7](docs/MILESTONE-7.md), [Milestone 8](docs/MILESTONE-8.md), and [Milestone 9](docs/MILESTONE-9.md).
