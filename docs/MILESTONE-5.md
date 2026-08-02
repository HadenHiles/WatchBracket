# Milestone 5: TMDB catalog and explainable wildcards

Milestone 5 replaces the production mock-catalog boundary with normalized TMDB metadata and deterministic, availability-aware wildcard generation.

## Provider boundary

Only `integration-service` receives the TMDB bearer token or contacts `api.themoviedb.org`. The game API submits one of two typed operations: `SEARCH` or `RECOMMENDATIONS`. User input can become query parameters but never an upstream hostname, path, or header. Provider calls have five-second per-request timeouts, bounded retries, and an in-memory six-hour response cache.

Search enriches movie and TV results with runtime, regional certification, genres, poster/backdrop paths, and watch-provider offers. The configured household region is used, with Canada as the default. Availability carries visible JustWatch attribution and separate `SUBSCRIPTION`, `FREE`, `ADS`, `RENT`, and `BUY` categories.

## Canonical cache

PostgreSQL uniquely identifies TMDB media by media type plus TMDB ID. It stores metadata expiry, artwork references, and expiring availability snapshots. A repeated provider result updates the same canonical media row, so duplicate recommendations or nominations cannot create duplicate bracket candidates.

## Candidate construction

Direct nominations remain highest priority. The provider merges TMDB recommendation, similar-title, and genre-discovery results across all canonical direct picks. Each wildcard stores normalized score components, total score, source, related-pick reasons, availability reason, runtime reason, and diversity reason.

Selection is reproducible from cached provider inputs, the stored room creation year, and the room random seed. A soft diversity pass limits a primary genre to three initial wildcard slots before relaxing. Hard media type, runtime, release year, excluded genre, adult-content, and watch-now filters run through one shared evaluator for search results, direct submissions, provider wildcards, and development fallback titles.

Administrators can open `/admin/recommendations`, enter a room UUID, and inspect the exact stored score components and reasons without exposing credentials.

## Failure behavior

Production never substitutes the mock catalog when TMDB fails. Search reports a recoverable provider error; bracket generation asks the host for more nominations or adjusted rules when there are not enough valid titles. Existing tournaments continue from stored candidate data.
