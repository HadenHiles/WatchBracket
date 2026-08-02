# ADR 0001: Separate integration service

Status: accepted

Media-provider credentials create a different trust boundary from public game traffic. A small internal Fastify service will own TMDB, Plex, Tautulli, and Seerr adapters, validate typed operations, and enforce configured upstreams. It has no Caddy route. The game API gets normalized data through a narrow authenticated contract; clients never receive provider secrets or arbitrary fetch capability.

