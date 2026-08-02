# Starting Codex Prompt for Watch Bracket

You are the lead engineer starting a new self-hosted TypeScript application named **Watch Bracket**.

The canonical production URL is:

```text
https://bracket.famflix.live
```

The friendly alias is:

```text
https://vote.famflix.live
```

The alias must permanently redirect to the canonical host while preserving the path and query string.

Read `docs/SPEC.md` completely before modifying files. Treat it as the product and architecture source of truth. When this prompt and the specification appear to conflict, stop and follow the specification.

## Scope for this iteration

Implement **Milestone 0 and Milestone 1 only**.

Create the repository foundation and the smallest production-minded vertical slice that proves:

1. A household host can sign in from a phone.
2. The host can create a room and automatically join it as a participant.
3. Two guest browsers can join with a room code and nickname.
4. Presence updates in real time without refreshing.
5. Refreshing any participant restores the same session without duplicate rows.
6. The host can lock and unlock the room.
7. A third browser can pair as a read-only shared display.
8. The shared display shows the lobby and updates independently of the host browser.
9. The host can revoke the display session.
10. Restarting the game API reconstructs durable room state from PostgreSQL.
11. The production Compose topology does not expose PostgreSQL, the game API, or the integration service publicly.
12. A lightweight Cast receiver shell is built and served at `/cast/receiver/`, but Google Cast launching and token exchange are not implemented until Milestone 2.

Do not implement nominations, media search, recommendations, voting, tournament logic, TMDB, Plex, Tautulli, Seerr, the Google Web Sender SDK, Cast launch tokens, native apps, or final visual branding in this iteration.

## Fixed product decisions

Do not revisit these decisions:

- Product name: **Watch Bracket**
- Canonical host: `bracket.famflix.live`
- Redirect alias: `vote.famflix.live`
- Self-hosted Docker deployment
- Existing Caddy and Cloudflare Tunnel are the production ingress
- Mobile browser is the controller
- The host is also a normal participant
- Guests join without accounts
- Creating rooms requires an authenticated household host
- Chromecast Custom Web Receiver is first-class V1 work, but belongs to Milestone 2
- Browser display pairing is a supported fallback and belongs to this iteration
- Native phone and television applications are not V1 work
- The game server owns all authoritative state and deadlines
- PostgreSQL is the only required state service in V1
- Do not add Redis, Valkey, Kafka, RabbitMQ, or another coordination service
- The integration service is an internal security boundary
- Media credentials will eventually exist only in the integration service
- No LLM dependency belongs in the product

## Required repository shape

Use a pnpm workspace with this structure:

```text
watch-bracket/
  apps/
    web/
    game-api/
    integration-service/
    cast-receiver/
  packages/
    config/
    db/
    display-protocol/
    display-ui/
    provider-contracts/
    realtime-protocol/
    shared/
    test-utils/
  infra/
    caddy/
    cloudflared/
    docker/
  docs/
    adr/
    cast/
    display-protocol/
    integrations/
    DEPLOYMENT.md
    SECURITY.md
    SPEC.md
  .github/
    workflows/
  compose.dev.yml
  compose.prod.yml
  .env.example
  README.md
  pnpm-workspace.yaml
  package.json
```

You may add folders where implementation requires them. Do not create empty architecture for later milestones.

## Required technology

Use current stable compatible versions and commit the lockfile.

- TypeScript with strict mode
- pnpm workspaces
- Next.js App Router for `apps/web`
- Fastify for `apps/game-api`
- Fastify for `apps/integration-service`
- React and Vite for `apps/cast-receiver`
- Socket.IO for realtime controller and browser-display events
- PostgreSQL
- Drizzle ORM with generated migrations
- Zod for environment, HTTP, session, realtime, and internal-service schemas
- Pino structured logging
- Argon2id for host password hashing
- Vitest
- Playwright
- Docker Compose

Do not use Prisma. Do not add Turborepo unless the existing workspace scripts demonstrably become inadequate. Do not add Redux, Zustand, GraphQL, tRPC, React Native, Expo, Electron, or a native mobile framework.

Use simple, explicit code. Prefer a small number of well-named modules over a generic framework built inside the project.

## Architecture boundaries

### Browser access

The browser may communicate only with the public Watch Bracket origin through Caddy.

Public paths:

```text
/                    -> web
/join/*               -> web
/room/*               -> web
/display/*            -> web
/admin/*              -> web
/api/*                -> game-api
/socket.io/*          -> game-api
/cast/receiver/*      -> cast-receiver
```

### Internal access

- `game-api` may communicate with PostgreSQL and the internal integration service.
- `integration-service` may expose only an internal health endpoint and typed placeholder provider operations.
- `integration-service` must have no Caddy route and no published production port.
- PostgreSQL must have no Caddy route and no published production port.
- `web` must not connect directly to PostgreSQL or the integration service.
- `cast-receiver` is static and must not contain secrets.

### Production ingress

The application is intended to attach to Haden's existing Caddy network. Provide both:

1. A standalone development topology that is easy to run locally.
2. A production example that assumes an existing Caddy and cloudflared deployment.

Do not create a second mandatory production Caddy container if the existing reverse proxy can be used. Supply a tested Caddyfile snippet and clear network instructions.

## Security requirements

These requirements are mandatory.

### General

- Do not use host networking.
- Do not use privileged containers.
- Do not mount `/var/run/docker.sock`.
- Do not expose PostgreSQL or the integration service publicly.
- Do not build a generic upstream HTTP proxy.
- Do not accept a user-controlled URL for any internal fetch operation.
- Validate every external and internal payload with Zod.
- Apply request body size limits.
- Validate `Origin` for cookie-authenticated mutations and Socket.IO connections.
- Add CSRF protection to cookie-authenticated mutations.
- Never log cookies, tokens, passwords, authorization headers, pairing codes, or complete request bodies.
- Use structured error codes and request IDs.
- Use cryptographically secure randomness from Node's crypto APIs.

### Host authentication

Implement a single-household bootstrap flow suitable for a private deployment.

Environment variables:

```text
ADMIN_BOOTSTRAP_EMAIL
ADMIN_BOOTSTRAP_PASSWORD
```

On first startup:

- If no admin exists, create one from the bootstrap values.
- Hash the password with Argon2id.
- Never store or log the plaintext password.
- Do not recreate or overwrite an existing admin automatically.
- Document how to rotate or reset the bootstrap account safely.

Host sessions:

- Use a cryptographically random opaque token.
- Store only a keyed hash of the token in PostgreSQL.
- Set a secure, HTTP-only, same-site cookie.
- Use an explicit expiration.
- Rotate the session on login.
- Support logout and session revocation.
- Rate-limit failed login attempts.

Do not implement OAuth, Plex login, passkeys, TOTP, or password reset email in this iteration.

### Guest participant sessions

- A room code is a lookup handle, not authorization.
- Joining creates a room-scoped participant session.
- Store only a keyed hash of the session token.
- Restore the participant after refresh.
- Never create a second participant row for a valid existing session.
- Participant nicknames are unique within an active room after Unicode normalization, trim, whitespace collapse, and case-insensitive comparison.
- Reject empty, excessively long, control-character, or unsafe display names.

### Browser display sessions

- Pairing codes are not room codes.
- Generate a short pairing code with secure randomness.
- Store only a hash.
- Expire it within five minutes.
- Limit attempts and invalidate it after successful exchange.
- The resulting display session is room-scoped, read-only, revocable, and independently reconnectable.
- A display session cannot join as a participant, vote, mutate room state, or access host endpoints.
- Store only a hash of the display session token.

### Room codes

Use a six-character unambiguous alphabet:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

Handle the unlikely collision by retrying inside a bounded loop and relying on a unique database constraint.

## Persistence design

PostgreSQL is the durable source of truth.

Do not add Redis.

Presence is ephemeral and may be held in process memory, but participant identity and room membership are durable.

All time-sensitive rows must store absolute UTC timestamps. Do not rely on a Node timer as the only copy of a deadline.

Implement a minimal scheduler inside `game-api` that periodically claims due room-expiration work with a database transaction. Use a pattern that can later support multiple workers safely, such as `FOR UPDATE SKIP LOCKED`, but run only one API instance in V1.

The scheduler must:

- Start after database readiness.
- Stop cleanly on shutdown.
- Never expire a room twice.
- Recover overdue work after restart.
- Avoid a tight polling loop.

## Domain scope

Only implement room states:

```text
LOBBY
EXPIRED
```

Design the schema and types so later states can be added without replacing the room model.

Roles for this iteration:

```text
HOST
PARTICIPANT
```

Reserve but do not implement:

```text
CO_HOST
SPECTATOR
```

A display is an authorization class, not a participant role.

## Required database tables

Create minimal, explicit versions of:

### `admin_users`

- UUID primary key
- Normalized unique email
- Password hash
- Role
- Created, updated, and last-login timestamps

### `admin_sessions`

- UUID primary key
- Admin user ID
- Session token hash
- Expires, revoked, created, and last-seen timestamps
- Indexes for active-session lookup and cleanup

### `households`

- UUID primary key
- Name
- Region, default `CA`
- Time zone, default `America/Toronto`
- Created and updated timestamps

Create exactly one default household for the bootstrap admin.

### `rooms`

- UUID primary key
- Household ID
- Unique room code
- Room name
- State
- Host participant ID, nullable only during the creation transaction
- Locked timestamp
- Expires timestamp
- Created and updated timestamps
- Optimistic version or equivalent concurrency field

### `participants`

- UUID primary key
- Room ID
- Normalized nickname
- Display nickname
- Role
- Session token hash
- Connected flag is not required as durable truth
- Joined, last-seen, removed, and created timestamps
- Unique constraint for normalized nickname within active room

### `display_pairing_codes`

- UUID primary key
- Room ID
- Pairing-code hash
- Attempt count
- Expires and consumed timestamps
- Created timestamp

### `display_sessions`

- UUID primary key
- Room ID
- Kind, currently `BROWSER`
- Display name
- Session token hash
- Paired-by participant ID
- Last-seen, expires, revoked, and created timestamps

### `idempotency_keys`

- UUID primary key
- Scope
- Actor identifier
- Idempotency key
- Request fingerprint
- Response status and body or resource reference
- Expires and created timestamps
- Unique compound constraint

Use idempotency for room creation and other critical retriable mutations.

### `audit_events`

- UUID primary key
- Household ID
- Room ID, nullable
- Actor type and actor ID
- Event type
- Safe JSON metadata
- Created timestamp

Do not store secrets or raw tokens in audit metadata.

## Public HTTP API

Use a consistent JSON error contract:

```ts
interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}
```

Implement:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session

POST /api/rooms
POST /api/rooms/join
GET  /api/rooms/:roomId/snapshot
POST /api/rooms/:roomId/lock
POST /api/rooms/:roomId/unlock

POST   /api/rooms/:roomId/display-pairing-codes
POST   /api/displays/pair
DELETE /api/displays/:displaySessionId

GET /api/health/live
GET /api/health/ready
```

Rules:

- Creating a room requires an authenticated host.
- Room creation and host-participant creation happen in one transaction.
- The host participant receives a participant session separate from the admin session.
- Joining a room requires the room code and nickname.
- Room snapshot authorization depends on host, participant, or display session.
- Snapshot DTOs must be role-specific. A display must receive only display-safe fields.
- Lock and unlock require the room host participant session.
- Display-pairing-code creation requires the room host.
- Display exchange consumes the pairing code atomically.
- Display deletion requires the room host.
- All mutations return idempotent results where a supplied idempotency key is supported.

## Web routes and UX

### `/`

Create a clean mobile-first landing page with:

- Watch Bracket name
- One-sentence value proposition
- Create a Room button
- Join a Room form
- Open Display link
- Host login state

Create a Room redirects an unauthenticated user to `/admin/login`, preserving the intended destination.

### `/admin/login`

- Email and password
- Clear validation
- Generic invalid-credentials response
- Loading state
- No account enumeration
- Touch-friendly controls

### `/room/[roomId]`

The host and participant lobby must show:

- Room name
- Large room code
- Copyable join link
- QR code
- Participant list
- Host badge
- Connection state
- Locked or open state
- Shared-display connection state
- Host controls when authorized

Host controls:

- Lock room
- Unlock room
- Generate browser-display pairing code
- Revoke paired display
- End or expire the room only if easy to include without broadening scope; otherwise document it as the next small task

Do not make the host use a separate admin page during ordinary play.

### `/display`

- Full-screen-friendly pairing page
- Pairing-code input
- Clear connection status
- No room-control UI

### `/display/[displaySessionId]`

The browser display lobby scene must show:

- Watch Bracket branding
- Room name
- Room code
- QR join link
- Participants arriving and leaving
- Locked or open state
- Connection or reconnecting indicator

Use a 16:9 safe layout and large readable text. Do not build final animations yet.

### `/display/test`

Create the beginning of Presentation Test Mode with deterministic lobby fixture data.

It must run without a database room and provide:

- 720p and 1080p viewport presets
- Missing-avatar simulation
- Reduced-motion toggle
- Connected and reconnecting states

Protect it in production with an environment flag or host authentication.

### `/cast/receiver/`

Create only a lightweight static receiver shell for this iteration:

- Watch Bracket logo and name
- “Ready for Cast setup” development message
- Build output suitable for Caddy static serving
- No Google Cast SDK integration yet
- No room connection yet
- No secret or environment value embedded beyond safe public configuration

Document the Milestone 2 integration point.

## Realtime protocol

Define shared Zod schemas in `packages/realtime-protocol` and `packages/display-protocol`.

Every server event must contain:

```text
schemaVersion
eventId
roomId
sequence
serverTimestamp
```

Client-to-server events:

```text
room:subscribe
participant:heartbeat
display:subscribe
```

Server-to-controller events:

```text
room:snapshot
room:participant-joined
room:participant-left
room:participant-reconnected
room:locked
room:unlocked
display:paired
display:revoked
room:error
```

Server-to-display events:

```text
display:snapshot
display:scene
display:revoked
display:error
```

For this iteration, the only display scene is a typed lobby scene.

Requirements:

- The server assigns monotonically increasing room event sequence numbers.
- A reconnect receives a complete current snapshot.
- The client requests a snapshot when it detects a sequence gap.
- The server never trusts a client-provided role or participant ID.
- Socket authorization is resolved from the session presented during the handshake.
- Browser-display sockets are placed in a read-only namespace or guarded authorization path.
- A revoked display socket is disconnected immediately.

## Cast-ready protocol boundaries

Do not implement Cast in this iteration, but prepare the boundaries correctly.

`packages/display-protocol` must not depend on:

- Next.js
- React
- Socket.IO classes
- Database row types
- Browser cookies
- Plex or Seerr response types

The Cast receiver and browser display will later consume the same semantic `DisplayEnvelope`.

Create a small ADR describing:

- Why the receiver will receive a single-use launch token over a custom Cast namespace
- Why the receiver will connect directly to the game API afterward
- Why scene traffic will not be relayed through the host phone
- Why the receiver is read-only

## Internal integration-service shell

Implement:

```text
GET /internal/health/live
GET /internal/health/ready
```

Add typed placeholder provider contracts for:

```text
TMDB
PLEX
TAUTULLI
SEERR
```

Every unimplemented operation must return a typed `NOT_CONFIGURED` or `NOT_IMPLEMENTED` error. Do not create fake successful media results in production code.

The integration service must not have a public Caddy route.

## Docker and deployment

Create:

```text
compose.dev.yml
compose.prod.yml
infra/caddy/Caddyfile.example
infra/cloudflared/config.example.yml
```

### Development Compose

May publish ports to loopback for:

- Web
- Game API
- Cast receiver
- PostgreSQL

Use explicit comments that these bindings are development-only.

### Production Compose

Use networks conceptually equivalent to:

```text
watchbracket_edge
watchbracket_data, internal
watchbracket_integrations, internal
```

Membership:

```text
web                 edge
cast-receiver       edge
game-api            edge, data, integrations
integration-service data, integrations
postgres            data
```

Assume Caddy joins `watchbracket_edge` externally.

Do not publish production ports for any Watch Bracket service.

Provide a Caddy example that:

- Routes `/api/*` and `/socket.io/*` to game-api
- Routes `/cast/receiver*` to cast-receiver
- Routes everything else to web
- Redirects `vote.famflix.live` to `bracket.famflix.live` with status 308
- Preserves path and query string
- Adds reasonable security headers without breaking Socket.IO
- Does not expose the integration service

Apply where compatible:

```yaml
read_only: true
cap_drop:
  - ALL
security_opt:
  - no-new-privileges:true
```

Use:

- Multi-stage Dockerfiles
- Non-root runtime users
- `tmpfs` for required writable temporary paths
- Health checks
- Named PostgreSQL volume
- Restart policies
- Conservative resource defaults

Do not claim a container is read-only compatible until it has actually been run that way.

## Environment configuration

Create `.env.example` with fake values only.

Required initial variables:

```text
NODE_ENV
PUBLIC_APP_URL=https://bracket.famflix.live
PUBLIC_ALIAS_URL=https://vote.famflix.live
DATABASE_URL

ADMIN_BOOTSTRAP_EMAIL=host@example.com
ADMIN_BOOTSTRAP_PASSWORD=replace-me
HOST_SESSION_PEPPER=replace-me
PARTICIPANT_SESSION_PEPPER=replace-me
DISPLAY_SESSION_PEPPER=replace-me
CSRF_SECRET=replace-me

GAME_API_INTERNAL_URL
INTEGRATION_SERVICE_INTERNAL_URL
INTEGRATION_SERVICE_SHARED_SECRET=replace-me

ROOM_CODE_LENGTH=6
ROOM_MAX_PARTICIPANTS=8
ROOM_TTL_HOURS=12
DISPLAY_PAIRING_TTL_SECONDS=300

ENABLE_PRESENTATION_TEST_MODE=true
```

Do not include provider credentials in the web or game-api environment examples. Add clearly commented placeholders only in the integration-service section for future milestones.

Validate environment variables at process startup and fail with a useful redacted message.

## Root scripts

Provide:

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm compose:dev
pnpm compose:prod:config
```

Scripts must work from the repository root.

## Required tests

### Unit tests

Cover:

- Room-code alphabet and length
- Nickname normalization
- Session-token hashing and comparison
- Pairing-code hashing and expiry
- Role authorization
- Event sequence increment
- Error-contract serialization

### API integration tests

Cover:

- Bootstrap admin creation
- Re-running bootstrap without overwriting the admin
- Login success and failure
- Room creation transaction
- Host automatically becoming a participant
- Room creation idempotency
- Guest join
- Duplicate nickname rejection
- Locked-room rejection
- Unlock and subsequent join
- Host authorization for lock and unlock
- Display pairing-code creation
- Pairing-code expiration
- Pairing-code one-time use
- Display revocation
- Display endpoint rejecting participant mutations
- Room expiration recovery after API restart or scheduler restart simulation

Use a real PostgreSQL test database. Do not silently replace persistence with an in-memory implementation.

### Playwright end-to-end test

Implement this complete flow:

1. Browser A signs in as the bootstrap host.
2. Browser A creates a room.
3. Confirm Browser A appears once as host and participant.
4. Browser B joins using the room code.
5. Browser C joins using the room code.
6. Browser A sees both guests without refreshing.
7. Refresh Browser B.
8. Confirm Browser A still sees only one Browser B participant.
9. Browser A creates a browser-display pairing code.
10. Browser D opens `/display`, enters the pairing code, and connects.
11. Confirm Browser D shows the same lobby participants.
12. Close or navigate Browser A away temporarily.
13. Browser C changes connection state or Browser E joins while the room remains open.
14. Confirm Browser D updates independently.
15. Restore Browser A.
16. Browser A locks the room.
17. Confirm Browser E cannot join.
18. Browser A revokes Browser D.
19. Confirm Browser D shows a revoked state and loses the realtime connection.

The test should use isolated browser contexts so cookies do not leak between roles.

## GitHub Actions

Create workflows that run:

- pnpm install with frozen lockfile
- lint
- typecheck
- unit tests
- integration tests with PostgreSQL service
- build all applications
- Playwright smoke test where practical
- Docker build validation
- production Compose config validation

Do not publish images or deploy in this iteration.

## Documentation

Create or update:

### `README.md`

Include:

- What Watch Bracket is
- Current milestone status
- Local prerequisites
- One-command development startup
- Database migration command
- Test commands
- Architecture summary
- Clear statement that media integrations and Cast launching are not implemented yet

### `docs/DEPLOYMENT.md`

Include:

- Existing Caddy deployment path
- Cloudflare Tunnel hostname mapping
- Docker network attachment
- Production secret handling
- Backup basics
- Explicit statement that no inbound router ports are required

### `docs/SECURITY.md`

Include:

- Trust boundaries
- Token storage model
- Host versus guest versus display authorization
- No generic proxy rule
- Logging redaction
- Vulnerability-reporting placeholder for future public release

### ADRs

Write at least:

```text
0001-separate-integration-service.md
0002-postgresql-without-redis-for-v1.md
0003-versioned-display-protocol.md
0004-cast-receiver-direct-server-connection.md
```

## Implementation rules

- Keep domain logic outside route handlers.
- Keep public DTOs separate from Drizzle row types.
- Use transactions for room and host-participant creation.
- Make critical mutations idempotent.
- Use database constraints as well as application validation.
- Do not use TODO comments in place of required behavior.
- A deliberate future placeholder must fail explicitly and be documented.
- Do not implement a feature merely because a library makes it easy.
- Do not add analytics, telemetry, or third-party error tracking.
- Do not expose internal IDs unnecessarily in public UI.
- Do not reveal whether a room exists to a heavily rate-limited unauthenticated probe beyond the join result.
- Do not claim a check passed unless it was actually run.

## Completion report

Before finishing, run every available check and provide:

1. A concise implementation summary.
2. The final repository tree.
3. Exact commands to start the local stack.
4. Exact commands to run migrations and tests.
5. Actual results for lint, typecheck, tests, builds, and Compose validation.
6. Any checks that could not run and the concrete reason.
7. Deliberate deviations from `docs/SPEC.md`.
8. Security-sensitive decisions made.
9. The next recommended vertical slice, which should be Milestone 2 Chromecast couch experience.

Stop after Milestone 0 and Milestone 1. Do not continue into nominations or Cast SDK integration.
