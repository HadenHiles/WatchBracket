# Integration boundary

TMDB, Plex, Tautulli, and Seerr-compatible live operations are implemented behind a private integration boundary. The internal service validates a discriminated provider-operation contract, exposes an authenticated setup-status endpoint containing health booleans and required variable names only, and never returns provider credentials or fake provider results. Credentials are injected only into that service.

TMDB supports movie/TV multi-search, detailed metadata, certifications, poster and backdrop paths, recommendations, similar titles, genre discovery, and region-scoped watch-provider data. `TMDB_API_READ_TOKEN` accepts either a v4 API read-access bearer token or a legacy v3 API key. Requests use an exact TMDB origin, bounded timeouts and retries, and a six-hour response cache. Watch-provider responses retain the required JustWatch attribution and distinguish subscription, free, free-with-ads, rental, and purchase offers.

The game API persists canonical `media type + TMDB ID` identities, metadata expiry, availability snapshots, wildcard score components, and human-readable reasons. Production provider failures are recoverable errors; only development and test may fall back to the mock catalog.

Plex inventory is refreshed at service startup, every 30 minutes, and on demand through the typed inventory operation. Plex GUIDs map local media to canonical TMDB identities, including show episode counts, and generated Plex Web links never contain a token. Watch Now accepts either configured streaming offers or confirmed local Plex availability.

Participant Plex authorization is encrypted at rest and keyed to the durable room participant session. Reloading a room asks the server for authoritative connection status; browser session storage contains only the non-sensitive account label used to avoid a disconnected-state flash, never the Plex token.

Tautulli history is reduced inside the integration service to household-level title play counts and last-watched timestamps. User names, user IDs, sessions, IP addresses, and raw history rows never cross the service boundary. Seerr-compatible status checks label titles as available, pending, processing, partial, or requestable. A media request can only be made for the completed room's canonical winner after an explicit host confirmation; TV requests additionally require the host to choose a server-controlled season policy.

All private providers use exact configured base URLs, five-second timeouts, bounded retries, and a one-minute circuit breaker after repeated failures. Guest input cannot select a provider URL, Plex library, Seerr server, quality profile, or root folder.
