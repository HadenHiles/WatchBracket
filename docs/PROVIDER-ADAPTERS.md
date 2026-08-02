# Provider adapter guide

Provider code belongs in `apps/integration-service`. Browsers and the game API must never receive provider credentials or arbitrary URL-fetch capability.

## Contract first

1. Add a narrow discriminated operation and result schema to `packages/provider-contracts`.
2. Accept canonical IDs and bounded scalar options, never a URL, token, server ID, root path, quality profile, or arbitrary provider payload from a guest.
3. Normalize the response before it leaves the integration service. Remove personal history, provider tokens, private artwork URLs, and fields the product does not need.
4. Parse upstream data defensively and return a stable provider error code.

Each operation must have an exact configured base origin, a five-second or tighter timeout, bounded retries only for transient failures, a circuit breaker, and a cache policy appropriate to the data. Log the provider name and stable error class, not credentials, query strings containing secrets, or raw responses.

## Testing

Adapter tests use injected `fetch` fixtures and must cover normalization, invalid upstream data, timeouts, and secret absence. Mutation adapters need a request-body assertion proving that only server-controlled fields are sent. Live verification is read-only unless a maintainer explicitly authorizes the external mutation.

Candidate data must continue through the common eligibility evaluator. An adapter cannot bypass room media type, runtime, year, genre, adult-content, availability, or recent-history rules.

## Current adapters

- TMDB: public catalog identity, metadata, artwork, recommendations, and regional JustWatch offers.
- Plex: local libraries and inventory normalized to TMDB GUIDs; tokens never appear in playback links.
- Tautulli: raw rows reduced to aggregate household title counts inside the private service.
- Seerr-compatible: capability/status reads and a host-confirmed canonical-winner request with a server-controlled TV season policy.
