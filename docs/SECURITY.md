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

The integration boundary has no generic proxy or user-controlled URL operation. Future provider base URLs are deployment configuration, never guest input.

In production, the integration service has a dedicated outbound provider network for internet and LAN API access. It publishes no ports and remains reachable from the game API only over the private internal integration network.

The first-run wizard persists only non-secret household defaults. Its integration readiness call crosses the authenticated internal boundary and returns configured booleans, never credential values. Provider secrets remain in the integration-service environment or mounted secret files and are redacted from service logs.

Tournament votes are room- and matchup-scoped. A unique database constraint permits one current vote per participant, updates replace the prior choice, explicit abstention cannot contain a candidate, and the server rejects votes after its stored deadline. Controller snapshots expose only the viewer's vote; displays receive completion counts before resolution and aggregate totals afterward.

The example Caddy configuration applies HSTS, nosniff, referrer, and permissions headers. The receiver gets a narrow CSP. Do not weaken it to admit arbitrary scripts, images, or connection destinations.

For a future public release, security reports will be accepted through a private advisory channel documented in `SECURITY.md`; the private deployment currently has no public reporting address.
