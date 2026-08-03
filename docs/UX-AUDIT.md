# UX audit

Audited across mobile controller, host lobby, joining, nominations, voting, winner, shared display, onboarding, and diagnostics.

## Product rules

- The next action is the strongest visual element.
- A choice should act immediately when its destination is unambiguous.
- Advanced controls stay available without competing with the normal path.
- Player-facing language describes the outcome, not the implementation.
- The TV is readable from across a room; the phone is operable with one hand.

## Findings resolved

| Screen | Friction found | Resolution |
| --- | --- | --- |
| Home | Plex personalization appeared after room creation, when it was easiest to miss | Added prominent Plex-branded create and join actions while retaining a clear no-sign-in path |
| Join | Personalization was disconnected from the act of joining | Added `Join + personalize picks` and kept nickname as the only required field |
| Lobby | Internal preset names and filters competed with starting the game | Renamed presets to Quick, Classic, and Relaxed; moved uncommon filters into `Change movie-night options`; renamed the primary action `Start picking` |
| Cast | Copy explained receiver mechanics | Reduced it to `Play on the TV` and a device picker action |
| Nominations | Poster, slot, and drag instructions described multiple interaction models | Tapping a poster now fills the next empty slot; once full, explicit replace-pick actions appear |
| Search | The purpose of search was less prominent than mechanics | Led with `Choose your top 2`, made autocomplete clear through immediate poster results, and removed visible interaction instructions |
| Suggestions | Plex watchlist was the only personal source shown | Added Plex watchlist plus recommendations informed by Plex and household Tautulli history |
| Voting | Generic `Lock in pick` required the player to map the selected poster back to the action | The button now says `Vote for [title]`; tapping posters remains the selection action |
| Active room | Room status appeared locked even though late voting is supported | State now says when late voters can join and when picks are in progress |
| TV pairing | Pairing copy described how the host generated the code | The screen now asks only for the code shown on the host phone |
| Winner | Links could point at private service addresses | Plex and Jellyseerr title links are built from their configured public URLs; Plex is preferred when the winner is locally available |
| Setup | Technical preset names leaked into onboarding | Setup uses the same plain-language preset names and a shorter integration status explanation |

## Intentionally advanced surfaces

Server setup and recommendation diagnostics retain technical values because they are administrator-only troubleshooting surfaces. They are linked away from the player flow and do not block creating or joining a room.

## Verification checklist

- Complete each flow at phone width without explanatory text.
- Verify keyboard focus, labels, disabled states, and 44-pixel or larger targets.
- Verify all room state changes arrive without refresh.
- Verify posters have loaded before visual capture.
- Verify an available champion shows `Watch now on Plex`; otherwise show Jellyseerr or streaming options.
- Verify the TV lobby, matchup, and podium at 720p and 1080p.
