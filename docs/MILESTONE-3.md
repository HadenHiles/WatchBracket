# Milestone 3: onboarding, mock catalog, and nominations

Milestone 3 delivers a provider-free nomination game slice and the first-run setup foundation requested for NAS deployments.

## First-run setup

After the bootstrap administrator signs in, an incomplete installation is redirected to `/setup`. The wizard stores only non-secret household configuration in PostgreSQL:

- household name, region, and IANA time zone
- default nomination preset
- onboarding completion state

The integrations step asks the private integration service whether TMDB, Plex, Tautulli, and Seerr variables are present. It receives booleans and variable names only. API keys and tokens remain in the root-owned `.env.integration.production` file or an equivalent read-only Docker secret; neither the web application nor game API stores or returns their values. Provider testing and API-backed setup actions remain part of Milestones 5 and 6.

## Nomination flow

- The deterministic 16-title catalog supports movie/TV and multi-term search without provider credentials.
- Each participant privately ranks exactly two different titles.
- Picks can be edited and relocked until the server deadline.
- Quick Pick, Movie Night, and Deep Dive presets provide 60, 120, and 180 second defaults.
- The host can add one minute or reveal early.
- The transition scheduler reveals expired nomination phases after restart.
- Duplicate titles merge into one candidate with support count and best rank.
- Controller snapshots expose only the viewer's picks before reveal. Display snapshots and scenes expose progress counts but no titles.
- Browser and Cast receivers consume the same versioned nomination-progress scene.

## Manual smoke test

1. Sign in on a fresh database and complete `/setup`.
2. Create a room and join from two private browser contexts.
3. Pair a browser display or Cast receiver.
4. Select a house-rule preset and start nominations.
5. Search and rank two titles from each controller; verify no other controller or display reveals them.
6. Unlock and replace a pick, then lock both picks again.
7. Add one minute as host and verify every controller restores the new deadline after reload.
8. Allow the server deadline to pass, or use **Reveal now**.
9. Verify duplicate titles show once with the correct support count on controllers, browser display, and Cast.

## Deliberate deferrals

- Tournament seeding and voting begin in Milestone 4.
- TMDB metadata/search begins in Milestone 5.
- Plex, Tautulli, and Seerr operations and credential health tests begin in Milestone 6.
- Physical Chromecast acceptance still requires a registered receiver ID and device.
