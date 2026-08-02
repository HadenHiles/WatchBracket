# NAS quick start

Watch Bracket is packaged as a Docker Compose application with four application images plus PostgreSQL. Keeping them separate lets the database and secret-bearing integration service remain unreachable from the public network.

## Prepare

On a NAS with Docker Engine and Compose v2:

```sh
git clone https://github.com/HadenHiles/WatchBracket.git
cd WatchBracket
cp .env.example .env
cp .env.integration.example .env.integration.production
docker network create watchbracket_edge
```

If an existing reverse proxy or Cloudflare Tunnel already uses a Docker network, set `EDGE_NETWORK_NAME` to that external network instead of creating `watchbracket_edge`.

Edit `.env` and `.env.integration.production`. Replace every `replace-me` database password, bootstrap password, pepper, CSRF secret, and shared integration secret. The database URL must use the same PostgreSQL password, and `INTEGRATION_SERVICE_SHARED_SECRET` must match in both files. `TMDB_API_READ_TOKEN` is required for production catalog search and recommendations. Plex, Tautulli, and Seerr credentials are optional; when configured, the setup wizard verifies their health without exposing their values. Both private files are already covered by `.gitignore`.

Attach your reverse-proxy container to `watchbracket_edge`, adapt `infra/caddy/Caddyfile.example` for your hostname, and route only through that proxy. The app expects HTTPS in production because authentication cookies are secure.

When Cloudflare Tunnel is the reverse proxy, route `/api/*` and `/socket.io/*` directly to `game-api:3001`, `/cast/receiver/*` to `cast-receiver:8080`, and the remaining hostname traffic to `web:3000`. Keep the Socket.IO rule direct so WebSocket room updates do not pass through the Next.js rewrite layer.

## Build and start

```sh
docker compose config
docker compose up -d --build
docker compose ps
```

The one-shot `migrate` service applies PostgreSQL migrations before the API starts. Persistent state lives in the named `watchbracket_pg` volume. No Compose service publishes a port directly; only the existing reverse proxy joins the external edge network.

The integration service also joins an outbound-only bridge network so it can reach TMDB and configured LAN media servers. It still publishes no ports; provider base URLs and credentials belong only in `.env.integration.production`.

Open the configured public URL. Anyone on your trusted network can create or join a room without an account. Use **Server settings** and the bootstrap credentials only when you need to complete `/setup` or change integration defaults.

## Upgrade and back up

Back up the PostgreSQL volume before upgrades. Then run `git pull --ff-only` followed by the same `docker compose up -d --build` command. The migration job runs first and exits. A normal restart with no source change is simply `docker compose up -d`.

To inspect health without exposing services, use `docker compose ps` and `docker compose logs game-api integration-service`. Never publish PostgreSQL port 5432 or integration-service port 3002 to the LAN or internet.
