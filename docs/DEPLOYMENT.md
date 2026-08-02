# Deployment

Watch Bracket is designed to join an existing Caddy and cloudflared stack. It does not create a second mandatory production proxy.

## Existing Caddy path

1. Create the external network once: `docker network create watchbracket_edge`.
2. Attach the existing Caddy container to `watchbracket_edge`.
3. Add `infra/caddy/Caddyfile.example` to the existing Caddy configuration and reload Caddy.
4. Copy `.env.example` to `.env` and `.env.integration.example` to `.env.integration.production`. Replace the database and shared-secret values in both files, keep unused provider values empty, and restrict both files to the deployment administrator. Only the integration-service container reads the integration file.
5. Validate with `docker compose config` and start with `docker compose up -d --build`.
6. Open the public app and create a room immediately, or use **Server settings** with the bootstrap administrator to complete `/setup`. The wizard saves household defaults and reports which provider variables the isolated integration container can see.

Caddy routes `/api/*` and `/socket.io/*` to `game-api`, `/cast/receiver*` to the static receiver, and all other paths to `web`. The alias uses a 308 redirect to `https://bracket.famflix.live{uri}`, which preserves path and query string.

After registering the Custom Web Receiver, set `CAST_RECEIVER_APP_ID` before building the web image. The registered receiver URL must be `https://bracket.famflix.live/cast/receiver/`; Cast devices cannot use localhost for the published receiver.

## Cloudflare Tunnel

Use `infra/cloudflared/config.example.yml` in the existing cloudflared deployment. Both public hostnames point only to Caddy. Never add direct tunnel routes to the API, integration service, PostgreSQL, or other NAS services. WebSockets must remain enabled and interactive challenges must not cover Socket.IO or the receiver path.

Cloudflare Tunnel is outbound. No inbound router ports or port-forwarding rules are required.

## Networks

- `watchbracket_edge`: existing Caddy, web, game API, Cast receiver
- `watchbracket_data`: game API, integration service, PostgreSQL; Docker-internal
- `watchbracket_integrations`: game API and integration service; Docker-internal for this milestone

Production Compose publishes no service ports. The integration service has no Caddy route.

## Secrets and account rotation

Use root-owned `.env.production` and `.env.integration.production` files or an equivalent secret injection mechanism. The internal shared secret must match in both files. Provider secrets, when added later, belong only in the latter integration-service environment. Session peppers and the bootstrap password belong only in the game API environment.

The onboarding wizard deliberately does not write Docker environment files: a read-only, non-root container cannot safely rewrite its own deployment configuration. Add provider keys to `.env.integration.production`, restart only `integration-service`, and revisit **Setup & integrations** to refresh the secret-safe configured/not-configured indicators.

Bootstrap values are consulted only when `admin_users` is empty. Changing `ADMIN_BOOTSTRAP_PASSWORD` does not overwrite an existing password. To rotate safely, use an audited database maintenance procedure during downtime: generate a new Argon2id hash with the application library, update the intended `admin_users.password_hash`, revoke all rows in `admin_sessions`, then restart. To re-bootstrap a lost private installation, back up PostgreSQL first, explicitly remove the intended admin and sessions, and restart with new bootstrap values; do not drop the household or rooms casually.

## Backups

Back up the named PostgreSQL volume using `scripts/backup.sh` on a schedule and test every archive with `scripts/verify-restore.sh`. Also back up non-secret Compose/Caddy configuration. Keep `.env.production` in a separate encrypted secret backup. Follow `docs/BACKUP-RESTORE.md` and `docs/UPGRADES.md`; restore into a clean database before starting `game-api`, then run migrations once.
