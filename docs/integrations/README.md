# Integration boundary

TMDB, Plex, Tautulli, and Seerr live operations are deferred to Milestones 5 and 6. The internal service currently validates typed provider-operation envelopes, exposes an authenticated setup-status endpoint containing booleans and required variable names only, and fails provider operations explicitly with `NOT_IMPLEMENTED`; it never returns fake provider results. Credentials are injected only into that service.
