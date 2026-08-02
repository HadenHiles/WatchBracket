# Milestone 6: private media-server integrations

Milestone 6 connects Watch Bracket to the household media stack without widening the public API or exposing provider credentials.

## Implemented

- Typed Plex health and inventory operations with scheduled refresh, library discovery, TMDB GUID mapping, local movie availability, and show episode counts.
- Aggregate-only Tautulli history used as a novelty signal. Personal viewing fields are discarded inside the private integration service.
- Seerr-compatible health, existing-status, and request operations. Only the canonical tournament winner can be requested, only by the room host, and only after explicit confirmation.
- Explicit `FIRST`, `LATEST`, or `ALL` TV season policy. Guests cannot choose server IDs, profiles, root folders, provider URLs, or arbitrary request fields.
- `WATCH_NOW` rules recognize Plex and configured streaming offers. `HYBRID` rules additionally admit titles confirmed requestable through Seerr.
- Exact configured origins, bounded timeouts/retries, circuit breakers, graceful optional-provider degradation, and redacted integration headers.

## Operations

The internal provider endpoint accepts only the versioned discriminated operations `HEALTH`, `PLEX_INVENTORY`, `TAUTULLI_HISTORY`, `SEERR_STATUS`, `SEERR_REQUEST`, `SEARCH`, and `RECOMMENDATIONS`. It has no generic URL-fetch operation.

The setup wizard reports configured/connected status but never receives base URLs, tokens, keys, raw Plex records, raw Tautulli history, or Seerr configuration.
