# Security model

## Trust boundaries

The browser communicates only with the public Caddy origin. `game-api` owns authorization and room state. PostgreSQL is private durable storage. `integration-service` is a separate internal boundary and is not publicly routed. The static receiver contains no secrets.

Host, participant, and display credentials are separate opaque tokens. Only keyed HMAC hashes are stored in PostgreSQL. Cookies are HTTP-only, Secure in production, SameSite=Lax, scoped to the application, and explicitly expired. Cookie-authenticated mutations require an origin check and signed double-submit CSRF token. Login, joining, and pairing are rate-limited.

## Authorization classes

- Admin session: may create rooms; cannot stand in for a participant session.
- Host participant: a normal participant linked as the room host; may lock, unlock, pair, and revoke displays.
- Guest participant: room-scoped membership and presence only.
- Browser display: room-scoped read-only snapshot and display events only; it cannot call participant or host mutations.

Room and pairing codes are lookup handles, not sessions. Pairing codes expire within five minutes, are one-time use, are attempt/rate limited, and are stored only as hashes.

Cast launch tokens expire within 60 seconds and are consumed transactionally once. The custom Cast message carries no room ID, participant identity, or long-lived credential. Cast display bearer tokens remain in receiver memory, are accepted only as read-only display authorization, and are redacted from logs.

## Defensive controls

All environment, HTTP, internal-provider, and realtime inputs use Zod schemas. Request bodies and Socket.IO buffers are bounded. Errors use stable codes and request IDs. Pino redacts cookies, authorization, CSRF material, passwords, and tokens. Audit metadata contains IDs and safe action context only.

The integration boundary has no generic proxy or user-controlled URL operation. Provider base URLs are deployment configuration, never guest input.

In production, the integration service has a dedicated outbound provider network for internet and LAN API access. It publishes no ports and remains reachable from the game API only over the private internal integration network.

The first-run wizard persists only non-secret household defaults. Its integration readiness call crosses the authenticated internal boundary and returns configured booleans, never credential values. Provider secrets remain in the integration-service environment or mounted secret files and are redacted from service logs.

Tournament votes are room- and matchup-scoped. A unique database constraint permits one current vote per participant, updates replace the prior choice, explicit abstention cannot contain a candidate, and the server rejects votes after its stored deadline. Controller snapshots expose only the viewer's vote; displays receive completion counts before resolution and aggregate totals afterward.

The example Caddy configuration applies HSTS, nosniff, referrer, and permissions headers. The receiver gets a narrow CSP. Do not weaken it to admit arbitrary scripts, images, or connection destinations.

## V1 release checklist

- [x] Production accepts mutations only from the configured public origin.
- [x] Cookie-authenticated mutations require a signed double-submit CSRF token.
- [x] Global and sensitive-operation rate limits are enabled.
- [x] Web, API, receiver, and proxy security headers have explicit policies.
- [x] Provider credentials stay inside the unexposed integration service and are redacted from logs.
- [x] Dependency, secret, and container scans run in CI; production dependency audit is clean at release.
- [x] Environment files, dumps, backups, private addresses, and infrastructure details are excluded from Git.
- [x] Backups use a versioned database dump and are restored into an isolated database for verification.
- [x] Displays are room-scoped and read-only; Cast launch tokens are single-use and short-lived.
- [x] Admin, participant, display, provider, and database trust boundaries use separate credentials and networks.

## Reporting a vulnerability

Do not open a public issue containing an exploit, credential, private address, room data, or viewing history. Use the repository's private GitHub Security Advisory flow. Include the affected revision, impact, reproduction, and any suggested mitigation. Maintainers should acknowledge a complete report within seven days, coordinate a fix and disclosure window, and credit reporters who want attribution.

Supported security fixes target the latest V1 revision. Self-hosters should retain verified backups and upgrade promptly after a security release.
