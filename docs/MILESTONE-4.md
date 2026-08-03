# Milestone 4: Double-Take tournament

Milestone 4 turns the revealed mock candidate pool into a complete server-authoritative game.

## Tournament formats

The pure `@watch-bracket/tournament-engine` package supports the fixed Double-Take paths:

| Format | Qualifiers | Spotlight | Redemption | Championship | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8 titles | 4 | 2 | 1 | play-in + final | 9 |
| 12 titles | 6 | 3 | 2 semis + final | 2 semis + final | 15 |
| 16 titles | 8 | 4 | 2 returns | 2 play-ins + 2 semis + final | 19 |

Opening seeds are deterministic for the stored room seed. Pairing avoids shared nominators and shared franchise keys when possible, then uses balanced outer seeding. Direct nominations receive three rank points for a first choice and two for a second choice. Unique supporter count remains the primary seed signal, with ranked interest breaking otherwise similar support.

Qualifier redemption is deliberately overlap-first: broad ranked group interest, unique supporter count, qualifier vote share, stored candidate score, then seed. A highly shared title therefore receives a meaningful second chance even if an unlucky opening pairing produces a decisive loss.

## Durable orchestration

PostgreSQL stores candidates, the serialized versioned engine state, rounds, matchups, eligible voters, deadlines, votes, results, and the champion. Only one matchup is active at a time.

The transition worker advances three durable phases:

1. `MATCHUP_INTRO` to `VOTING` when the intro deadline passes.
2. `VOTING` to `MATCHUP_RESULT` when the server voting deadline passes.
3. `MATCHUP_RESULT` to the next intro or `WINNER` after the result deadline.

Each transition locks the room and tournament rows. Matchups have unique engine keys, a resolved matchup cannot resolve twice, and a result is marked advanced in the same transaction that creates its successor. On API restart, the scheduler reads stored deadlines and resumes without rebuilding or reseeding the bracket.

## Voting and ties

- One row per participant and matchup; resubmission updates that row.
- Explicit abstention stores no candidate ID.
- Server time rejects late votes.
- Eligibility is captured when the matchup is created, so a temporary disconnect does not remove a voter. A late joiner is appended while the intro or voting window is still open and is eligible for every later matchup.
- Displays receive completion counts, never live splits or participant choices.
- Hosts vote like every other eligible participant and cannot force a winner.

Live ballot majorities remain authoritative. Ties first compare the group-interest score (`2 × unique supporters + first-choice supporters`), which is equivalent to weighting first choices at three points and second choices at two. Exact interest ties then use unique nominators, first-choice nominations, pre-tournament score, and finally a reproducible room-seeded coin flip. Abstention and no-response totals are retained in the resolution; because abstention is not assigned to either candidate, it cannot distinguish the two sides of a tied matchup.

## Presentation sequence

Browser and Cast displays render the same validated semantic scenes:

- matchup intro
- private voting countdown and completion count
- result and aggregate split
- redemption-labelled matchups
- championship winner and winner path

`/display/test` includes deterministic lobby, nomination, intro, voting, result, and winner fixtures at 720p and 1080p. The Cast receiver remains attached independently of the sender and stops five minutes after the winner scene.

## Manual smoke test

1. Complete nominations and reveal at least four unique direct picks.
2. Build an eight-title bracket; verify deterministic mock wildcards fill empty positions.
3. Pair a browser display and launch the Cast receiver.
4. For each matchup, update one vote, abstain from another controller, and allow the deadline to resolve.
5. Confirm neither display shows a live split, while both show the same vote-completion count.
6. Exercise the host timer extension and intro/result skip controls.
7. Confirm qualifier losers enter the redemption stage and carry one strike.
8. Finish all nine matchups and compare the controller, browser display, and Cast winner path.
9. Restart the API during intro, voting, and result phases in separate runs; confirm the same matchup and deadline resume.

## Deliberate deferrals

- Optional host-decided and sudden-death tie modes.
- Pause/resume and candidate replacement controls.
- Artwork-backed animation and provider metadata arrive with Milestones 5, 6, and 8.
- Winner actions, Run It Back, and household history arrive in Milestone 7.
- Physical Chromecast acceptance requires the registered receiver and hardware environment.
