# Integration boundary

TMDB live operations are implemented for Milestone 5. Plex, Tautulli, and Seerr remain Milestone 6 work. The internal service validates a discriminated provider-operation contract, exposes an authenticated setup-status endpoint containing booleans and required variable names only, and never returns fake provider results. Credentials are injected only into that service.

TMDB supports movie/TV multi-search, detailed metadata, certifications, poster and backdrop paths, recommendations, similar titles, genre discovery, and region-scoped watch-provider data. `TMDB_API_READ_TOKEN` accepts either a v4 API read-access bearer token or a legacy v3 API key. Requests use an exact TMDB origin, bounded timeouts and retries, and a six-hour response cache. Watch-provider responses retain the required JustWatch attribution and distinguish subscription, free, free-with-ads, rental, and purchase offers.

The game API persists canonical `media type + TMDB ID` identities, metadata expiry, availability snapshots, wildcard score components, and human-readable reasons. Production provider failures are recoverable errors; only development and test may fall back to the mock catalog.
