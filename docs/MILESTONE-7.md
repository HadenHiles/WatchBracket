# Milestone 7: winner actions, household memory, and replay

Milestone 7 turns the winning title into a clear next action and gives repeat groups useful memory without exposing individual watch history.

## Winner journey

The controller, browser display, and Cast receiver show the winner's tournament path, redemption status, availability, and a safe QR action. Locally available winners open in Plex. Other winners link to regional streaming options or canonical TMDB details. Requestable winners expose a host-only confirmation flow; success is shown only after Seerr returns a persisted request record.

## Group Taste Snapshot

Every completed room stores a deterministic household recap:

- up to three dominant candidate genres;
- the closest matchup and vote margin;
- a winning wildcard surprise, when present;
- final-round consensus percentage.

No LLM or participant-specific viewing record is used.

## Run It Back

The host can create one clean replay room from a completed room. Rules, room name, and the crew's reserved nicknames carry forward. The host moves immediately; returning guests can claim their reserved participant by joining with the same nickname from their existing browser session. The previous tournament remains immutable.

When household history is enabled, recent winners and candidates are excluded from wildcard generation for the configured 0–365 day window. The setup screen can disable this behavior or permanently clear all Watch Bracket history and derived taste summaries.

The optional next-episode helper remains disabled: the available aggregate provider data does not reliably identify the next episode for one household profile without crossing the product's privacy boundary.
