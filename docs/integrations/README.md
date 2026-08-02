# Integration boundary

TMDB, Plex, Tautulli, and Seerr are deferred beyond Milestone 1. The internal service currently validates typed provider-operation envelopes and fails explicitly with `NOT_IMPLEMENTED`; it never returns fake media results. Future credentials must be injected only into that service.

