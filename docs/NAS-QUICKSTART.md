# NAS quick start

Watch Bracket is packaged as a Docker Compose application with four application images plus PostgreSQL. Keeping them separate lets the database and secret-bearing integration service remain unreachable from the public network.

## Prepare

On a NAS with Docker Engine and Compose v2:

```sh
git clone <your-watch-bracket-repository-url>
cd WatchBracket
cp .env.example .env.production
cp .env.integration.example .env.integration.production
docker network create watchbracket_edge
```

If an existing reverse proxy or Cloudflare Tunnel already uses a Docker network, set `EDGE_NETWORK_NAME` to that external network instead of creating `watchbracket_edge`.

Replace every `replace-me` database password, bootstrap password, pepper, CSRF secret, and shared integration secret. The database URL must use the same PostgreSQL password, and `INTEGRATION_SERVICE_SHARED_SECRET` must match in both files. Provider keys are optional for the Milestone 3 local catalog.

Attach your reverse-proxy container to `watchbracket_edge`, adapt `infra/caddy/Caddyfile.example` for your hostname, and route only through that proxy. The app expects HTTPS in production because authentication cookies are secure.

## Build and start

```sh
docker compose --env-file .env.production -f compose.prod.yml config
docker compose --env-file .env.production -f compose.prod.yml up -d --build
docker compose --env-file .env.production -f compose.prod.yml ps
```

The one-shot `migrate` service applies PostgreSQL migrations before the API starts. Persistent state lives in the named `watchbracket_pg` volume. No Compose service publishes a port directly; only the existing reverse proxy joins the external edge network.

Open the configured public URL, sign in with `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`, and complete `/setup`.

## Upgrade and back up

Back up the PostgreSQL volume before upgrades. Then pull the new source or images and run the same `up -d --build` command. The migration job runs first and exits.

To inspect health without exposing services, use `docker compose ... ps` and `docker compose ... logs game-api integration-service`. Never publish PostgreSQL port 5432 or integration-service port 3002 to the LAN or internet.
