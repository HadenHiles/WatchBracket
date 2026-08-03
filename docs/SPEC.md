# Watch Bracket

## Final V1 Product, Experience, and Technical Specification

**Status:** Implementation source of truth  
**Verified:** August 2, 2026  
**Product name:** Watch Bracket  
**Canonical URL:** `https://bracket.famflix.live`  
**Friendly alias:** `https://vote.famflix.live`, permanently redirected to the canonical URL while preserving path and query string  
**Product type:** Self-hosted, real-time party game for choosing a movie or television show  
**Primary deployment:** Docker Compose on Haden's UGREEN NAS behind the existing Caddy and Cloudflare Tunnel stack  
**Primary controller:** Mobile web application, optimized first for Android Chrome but fully usable for joining and voting in current Safari, Chrome, Firefox, and Edge  
**Primary shared display:** Google Cast Custom Web Receiver launched from the host's Android phone or desktop Chrome  
**Display fallback:** Securely paired browser display for HDMI, screen mirroring, desktop casting, and compatible TV-box browsers  
**Initial integrations:** TMDB, Plex, Tautulli, and Seerr-compatible request systems  
**Initial audience:** Couples, families, and friend groups  
**Open-source goal:** Publish a documented repository after the private V1 is reliable in Haden's home setup

---

## 1. Product Summary

Watch Bracket turns the frustrating process of choosing something to watch into a short, couch-friendly party game.

A signed-in household host creates a room on their phone, chooses the valid media sources and house rules, and joins automatically as a normal participant. On supported Android Chrome or desktop Chrome, the host taps the Cast button and launches the Watch Bracket Custom Web Receiver on a Chromecast or Cast-enabled television. The phone remains both the host controller and the host's private voting device.

Other participants join through a link, QR code, or six-character room code. Each person privately submits up to two choices during a timed nomination phase. Watch Bracket expands the candidate pool with explainable recommendations drawn from the household's enabled services and local media library.

The candidates compete in animated one-versus-one matchups. Participants vote privately on their phones while the television shows poster entrances, countdowns, matchup results, bracket movement, second-chance redemption rounds, and the final winner. The receiver connects directly to the game server, so the presentation continues if the host locks their phone or temporarily leaves the browser.

The V1 product should answer one question exceptionally well:

> What can this group agree to watch tonight?

The experience must feel fast, playful, fair, polished, and trustworthy. Availability must never be a surprise. Recommendations must be explainable. The final winner must lead directly to a useful next action, such as opening Plex or the title in Seerr.

## 2. Final V1 Scope Decision

V1 is a web-first product with three intentional client experiences:

```text
Mobile controller
  Host setup, nominations, voting, and host controls

Google Cast Custom Web Receiver
  First-class couch display launched from Android Chrome or desktop Chrome

Browser display
  First-class fallback for HDMI, screen mirroring, desktop casting, or a TV-box browser
```

### 2.1 First-class V1 device support

| Device or path | V1 support | Intended use |
|---|---|---|
| Android phone with current Chrome | First class | Create room, participate, host, and launch Chromecast |
| Desktop Chrome on Windows, macOS, Linux, or ChromeOS | First class | Host, participate, launch Chromecast, or run browser display |
| Chromecast or Cast-enabled television | First class | Custom Web Receiver presentation |
| iPhone or iPad browser | First class for controller use | Join, nominate, vote, and manage a room when already authenticated |
| iPhone launching Chromecast from the website | Not supported by the Web Sender SDK | Deferred until a native iOS sender exists |
| Laptop connected by HDMI | First-class fallback | Paired browser display |
| AirPlay or ordinary screen mirroring | Supported fallback | Mirror the browser display |
| Android TV, Google TV, Fire TV, or smart-TV browser | Best effort | Open the paired browser display when the browser is capable |

Google's Web Sender SDK supports Cast-capable browsers on Android and desktop operating systems, but not Chrome on iOS. This is a documented product limitation, not a bug to disguise.

### 2.2 Required V1 capabilities

These are essential and must not be cut:

- Authenticated household host accounts, with guests joining without accounts
- Host phone acting simultaneously as host and participant
- Google Cast Custom Web Receiver launched from the host phone
- Secure browser-display fallback
- Real-time room presence, nominations, voting, and reconnection
- Two private nominations per participant
- Smart wildcard recommendations
- Plex availability awareness
- Tautulli-derived repeat avoidance
- Seerr request status and host-confirmed requests
- Canadian streaming-provider filtering
- Server-authoritative timers and tournament results
- Double-Take second-chance tournament format
- Clear winner action and Run It Back flow
- Safe self-hosting that exposes no other Docker service

### 2.3 V1 difference makers

These provide the wow factor and are part of the product identity:

- One-tap couch setup from an Android host phone
- Animated poster-versus-poster presentation on the television
- Redemption rounds that revive a strong early loser
- Explainable wildcard badges such as “Available in Plex and similar to two group picks”
- Dynamic backdrop treatment derived from title artwork
- A visible winner journey through the bracket
- Group Taste Snapshot after the result
- Request and Chill flow when a requestable title wins
- Presentation Test Mode for contributors and visual development

### 2.4 Nice-to-have V1 features

These should be implemented only after the essential path is stable:

- One Dealbreaker token
- Blind first-round nomination ownership
- Optional Android haptics
- Optional lightweight sound effects
- Spectator mode
- Continue-a-Show preset and next-episode helper
- Host-customized visual themes
- Sudden-death tie revote

### 2.5 Explicitly deferred

V1 does not include:

- Native Apple TV application
- Native Android TV application
- Native iOS or Android phone application
- Roku, Tizen, or webOS application
- First-class iPhone-to-Chromecast launch support
- Multi-household public SaaS hosting
- Playback or DRM streaming inside Watch Bracket
- Direct Sonarr, Radarr, download-client, or filesystem control
- LLM-generated recommendations

Future clients must consume the same versioned display and realtime contracts instead of reproducing game logic.

## 3. Product Principles

1. **Fast agreement beats endless browsing**  
   A normal game should finish in approximately 8 to 15 minutes.

2. **The host should never need to get off the couch**  
   The host phone creates the room, launches the Cast receiver, participates, votes, and controls the game. A laptop remains only a fallback.

3. **Every participant has meaningful influence**  
   Each participant receives equal nomination limits and one valid vote per matchup.

4. **Availability is a product rule**  
   Every candidate visibly communicates whether it is available now, available through a selected streaming service, or requires a Seerr request.

5. **Guests need no account, hosts do**  
   Guests use a nickname and room-scoped session. Creating rooms and triggering media requests require a trusted household host session.

6. **The server owns game truth**  
   Controllers and displays render server state. They never calculate winners, advance rounds, or operate timers independently.

7. **Media credentials never reach a public client**  
   Plex, Tautulli, Seerr, and TMDB credentials are stored only by the internal integration service.

8. **Recommendations should be relevant and diverse**  
   The candidate generator should not fill the bracket with sequels, one franchise, one genre, or superficially similar titles.

9. **No unnecessary LLM dependency**  
   V1 uses deterministic metadata, similarity, availability, and history scoring. An LLM is not required.

10. **Self-hosting must not expose the rest of the server**  
    Only the Watch Bracket reverse proxy is reachable through the public Cloudflare Tunnel.

11. **Open-source extensibility is designed, not overbuilt**  
    Provider adapters, Cast launch messages, and display scenes are documented extension points. Native clients are deferred until real demand exists.

---

## 4. Primary User Scenarios

### 4.1 Couple Night

Two people submit up to two choices each. Watch Bracket adds compatible wildcards and runs a short eight-title tournament.

### 4.2 Family Night

A household uses a preset such as Family Night or Kids Only, sets a maximum runtime, excludes unsuitable ratings, and avoids recently watched titles.

### 4.3 Friends Party

Three to eight participants join from their phones. The host launches the Chromecast from their Android phone, while HDMI and the paired browser display remain reliable fallbacks.

### 4.4 Plan Ahead

The group allows requestable titles. If the winner is not currently available, the host can confirm a Seerr request from the winner screen.

### 4.5 Continue a Show

The group votes on television series already in Plex. After a series wins, Watch Bracket attempts to resolve the next sensible episode for the host profile without exposing private watch history to other participants.

---

## 5. Room Modes and Rules

### 5.1 Availability Mode

#### Watch Now

Default mode. Only titles available immediately from at least one enabled source may enter the tournament.

Supported sources can include:

- Selected Plex libraries
- Enabled external streaming providers

Titles that require a Seerr request are excluded.

#### Hybrid

Available-now and requestable titles may enter. Available-now candidates receive a configurable scoring bonus. Every requestable title carries a visible badge throughout the tournament.

#### Plan Ahead

Requestable titles may compete normally. The winner screen emphasizes request status and host confirmation rather than immediate playback.

### 5.2 Media Type

The host chooses:

- Movies only
- TV shows only
- Mixed movies and TV

Mixed mode is marked experimental in V1 because films and series represent different time commitments.

### 5.3 Tournament Length

#### Quick

- Target pool: 8 titles
- Best for: 2 to 3 participants
- Approximate duration: 6 to 9 minutes

#### Standard

- Target pool: 12 titles
- Best for: 3 to 5 participants
- Approximate duration: 10 to 15 minutes

#### Party

- Target pool: 16 titles
- Best for: 5 to 8 participants
- Approximate duration: 15 to 20 minutes

The system automatically expands to the smallest pool that can contain all valid unique first-choice nominations. V1 supports a maximum of eight participants and sixteen unique direct nominations.

### 5.4 Configurable Room Rules

The host may configure:

- Room name
- Availability mode
- Media type
- Enabled Plex libraries
- Enabled streaming services
- Maximum runtime
- Minimum and maximum release year
- Allowed content ratings
- Preferred genres
- Excluded genres
- Original language preference
- Exclude titles watched recently
- Exclude titles watched by everyone in the household
- Exclude titles already declined in recent Watch Bracket games
- Submission count per participant, one or two
- Submission timer
- Voting timer, default 30 seconds
- Anonymous nominations
- Blind first round
- Dealbreaker token enabled or disabled
- Tie-break method
- Automatic winner request enabled or disabled, off by default
- Allow host to skip a broken matchup

### 5.5 House Rule Presets

V1 should include editable presets:

- **Anything Goes:** Minimal filtering
- **Date Night:** Two participants, shorter runtime, balanced genres
- **Family Night:** Family-safe ratings and moderate runtime
- **Kids Only:** Approved Plex libraries and child-safe ratings
- **Movie Night:** Movies only, Watch Now
- **Binge Something:** TV only, prefers unwatched or in-progress series
- **Plan Ahead:** Requestable titles enabled

Presets copy values into a room. They do not become hidden global behavior.

---

## 6. End-to-End User Flow

### 6.1 Host Creates a Room

The host opens `https://bracket.famflix.live`, chooses a preset or custom rules, and creates a room.

The server returns:

- A six-character room code using an unambiguous alphabet
- A join URL such as `https://bracket.famflix.live/join/7K9MQR`
- A QR code
- A host participant session
- A button to open or pair the shared display

The host does not need to expose or remember an administrative password during normal play.

### 6.2 Participants Join

Participants open the join link or enter the room code. They choose:

- Nickname
- Avatar icon or generated initials
- Optional accent choice

A secure room-scoped cookie restores the same participant after refresh or temporary disconnection.

### 6.3 Launch or Pair the Shared Display

#### Preferred path: Chromecast from the host phone

On supported Android Chrome or desktop Chrome, the authenticated host sees the standard Cast launcher in a consistent location.

When the host selects a receiver:

1. The web controller asks the game API for a cryptographically random, single-use Cast launch token.
2. The Web Sender SDK launches the registered Watch Bracket Custom Web Receiver.
3. The sender transmits only the launch token and protocol version through a custom Cast namespace.
4. The receiver exchanges the token over HTTPS for a room-scoped, read-only receiver session.
5. The receiver opens its own authenticated WebSocket connection to the game API.
6. The server sends a full display snapshot followed by versioned scene events.
7. The host phone remains a normal participant and receives the same voting prompts as everyone else.

The phone does not relay every scene to the television. Once paired, the receiver follows the authoritative game server directly. The presentation therefore survives temporary host-browser suspension, screen locking, and ordinary reconnection.

Cast launch tokens must be:

- Single use
- Valid for no more than 60 seconds
- Bound to one room
- Bound to the receiver role
- Stored server-side only as a hash
- Exchanged for a revocable session that cannot vote or invoke host actions

The receiver uses `disableIdleTimeout` only while an active room is attached because Watch Bracket is a non-media application. When the room ends or no active room is attached for five minutes, the receiver should stop and return the television to its normal home screen.

#### Fallback path: paired browser display

The shared device opens:

```text
https://bracket.famflix.live/display
```

It shows a short pairing code and QR code. The host confirms the pairing from their controller. This path is intended for HDMI, screen mirroring, desktop casting, and capable TV browsers.

After pairing:

- The display receives a read-only, room-scoped session
- The display redirects to `/display/:displaySessionId`
- It connects directly to the game API
- It cannot nominate, vote, alter rules, request media, or call host actions
- The host can revoke it immediately
- It requests a full snapshot after reconnecting

Browser display tokens should use secure HTTP-only cookies where practical. The Cast receiver uses an in-memory bearer session because it is launched and authenticated through the Cast channel.

### 6.4 Lobby

Controller clients show:

- Joined participants
- Host status
- Room rules summary
- Shared display and Cast connection status
- Ready state

The shared display shows:

- Watch Bracket branding
- Room name
- Large room code and QR code
- Participants arriving with animated name cards
- Enabled provider icons
- Media type and availability mode
- Waiting or ready state

The host can:

- Lock or unlock the room
- Remove a participant
- Promote a co-host
- Extend the join timer
- Launch, pair, resume, disconnect, or revoke a display
- Start the nomination phase

### 6.5 Nomination Phase

Each participant privately searches and submits up to the room limit.

Search results show:

- Poster
- Title and year
- Movie or TV badge
- Runtime or typical episode duration
- Content rating
- Genres
- Plex availability
- Enabled streaming provider badges
- Seerr requestable status
- Recently watched warning

Duplicate nominations are merged into one candidate. The candidate preserves the number of unique supporters and whether it was a first or second choice.

Participants may modify nominations until they lock their choices or the timer expires.

The shared display shows submission progress without revealing private choices unless anonymous nominations are disabled and the room reaches the reveal phase.

### 6.6 Candidate Generation

After nominations close, the server:

1. Resolves every nomination to a canonical TMDB identity.
2. Merges duplicates.
3. Validates availability against room rules.
4. Determines the target pool size.
5. Preserves all valid direct nominations that fit the configured maximum.
6. Generates additional wildcard candidates.
7. Applies diversity and duplicate-family constraints.
8. Stores reason codes and score components for every candidate.
9. Seeds the opening matchups.
10. Preloads display assets before the first reveal.

The controller may show a short "building the bracket" status. The shared display presents animated category cards or genre clues while candidates are prepared.

### 6.7 Tournament Phase

For every matchup:

1. The server publishes a matchup intro scene.
2. Posters and titles animate onto the shared display.
3. Each eligible participant receives the two choices on their controller.
4. The server publishes the authoritative voting deadline.
5. Participants vote once or abstain.
6. Votes arriving after the deadline do not count.
7. The server resolves the result and publishes it once.
8. The display animates the winner into its next slot.
9. The next matchup starts after a short result sequence.

The display shows how many votes have been received, but not the live vote split.

### 6.8 Winner Phase

The winner presentation includes:

- Large poster and backdrop
- Title, year, runtime, rating, and genres
- Availability source
- Why it entered the bracket
- Its tournament path
- Final vote result
- Plex playback or details link when available
- Seerr request confirmation when needed
- Streaming provider information when relevant
- QR code for the winner action
- Run It Back button for a new game using the same participants and rules

---

## 7. Tournament Design

### 7.1 Double-Take Tournament

Watch Bracket uses a fixed-duration second-chance format rather than a full double-elimination bracket. It gives strong early losers another opportunity without doubling the game length.

Every title begins with zero strikes. A title is permanently eliminated after its second meaningful loss or when it fails to qualify for redemption.

### 7.2 Stage A: Qualifiers

All candidates appear in one opening matchup.

- 8 candidates produce 4 qualifier matches
- 12 candidates produce 6 qualifier matches
- 16 candidates produce 8 qualifier matches

Qualifier winners enter the Spotlight Pool. Qualifier losers receive one strike and enter the Second Chance Pool.

### 7.3 Stage B: Spotlight Round

Qualifier winners compete again.

- 8-title game: 4 winners become 2 Spotlight winners
- 12-title game: 6 winners become 3 Spotlight winners
- 16-title game: 8 winners become 4 Spotlight winners

Presentation should emphasize that a winning title is defending its momentum. The result animation should keep the winning poster visible while it moves into the championship path.

### 7.4 Stage C: Redemption Round

The strongest qualifier losers are selected using:

- Qualifier vote share
- Number of unique nominators
- First-choice nomination count
- Whether the title lost because voters timed out
- Diversity value in the remaining field

Redemption structure:

- 8-title game: top 2 losers play once, 1 returns
- 12-title game: top 4 losers play two semifinals and one redemption final, 1 returns
- 16-title game: top 4 losers play two matches, 2 return

A returning candidate is marked with a redemption badge and already carries one strike.

### 7.5 Stage D: Championship Path

#### Eight-title game

- Two Spotlight winners
- One Redemption winner
- Lower-seeded Spotlight winner faces the Redemption winner in a play-in
- Play-in winner faces the top Spotlight winner in the final

#### Twelve-title game

- Three Spotlight winners
- One Redemption winner
- Two semifinals
- One final

#### Sixteen-title game

- Four Spotlight winners
- Two Redemption winners
- Two play-in matches create a four-title semifinal field
- Two semifinals
- One final

### 7.6 Match Seeding

Opening seeding should:

- Avoid matching two nominations from the same participant when possible
- Avoid same-franchise matchups in the opening round
- Separate the highest-scored direct submissions
- Pair direct submissions against recommendations at a balanced rate
- Avoid obvious popularity mismatches when confidence is high

Later rounds follow tournament results, with deterministic tie-break seeding.

### 7.7 Tie Handling

Default tie order:

1. Higher ranked group-interest score (three points per first choice, two per second choice)
2. More unique direct nominators
3. More first-choice nominations
4. Higher pre-tournament candidate score
5. Deterministic room-seeded coin flip

Optional host setting:

- Host breaks ties manually
- Sudden-death revote for ten seconds

A deterministic random seed must be stored so replays and debugging can reproduce the result.

### 7.8 Vote Integrity

- One vote per participant per matchup
- Vote updates allowed until the deadline, with only the latest valid vote counting
- Server timestamp determines validity
- Matchup result transition is idempotent
- Disconnected participants remain eligible until the deadline
- Removed participants are excluded from future matchups
- The display client cannot vote
- The host has no extra vote unless the room explicitly enables a host tie-break

---

## 8. Candidate Pool and Recommendation Algorithm

### 8.1 Candidate Allocation

The target pool is 8, 12, or 16.

Candidate priority:

1. Valid direct first-choice nominations
2. Valid direct second-choice nominations
3. Household Plex recommendations
4. TMDB recommendations related to multiple nominations
5. Enabled streaming-provider recommendations
6. Seerr-requestable recommendations in Hybrid or Plan Ahead mode
7. Diversity fillers when the pool remains too narrow

Recommendations should normally occupy 25 to 60 percent of the pool depending on participant count and unique nomination count.

### 8.2 Canonical Identity

TMDB ID plus media type is the canonical cross-provider identity.

Provider records may also retain:

- Plex rating key
- Plex GUIDs
- IMDb ID
- TVDB ID
- Seerr media ID
- Provider availability IDs

All adapter results must normalize to a shared `MediaItem` model before scoring.

### 8.3 Hard Filters

Candidates are rejected before scoring when they violate:

- Media type
- Availability mode
- Selected Plex libraries
- Enabled provider list
- Maximum runtime
- Release-year range
- Content-rating rules
- Excluded genre rules
- Explicit host blocklist
- Recently declined cooldown
- Missing required metadata

### 8.4 Candidate Scoring

Each candidate receives normalized components from 0 to 1.

Suggested default weighting:

```text
0.24  similarity to direct nominations
0.18  available-now confidence
0.13  support from multiple nomination clusters
0.10  household watch-history fit
0.09  rating confidence and vote count
0.08  genre and tone diversity value
0.06  runtime fit
0.05  recency or classic-fit balance
0.04  Plex library preference
0.03  novelty value
```

Direct submissions are admitted before wildcard ranking and also receive seeding metadata. The weighted score primarily ranks wildcard candidates and controls seeding.

### 8.5 Similarity Strategy

Use a blend of:

- TMDB recommendations
- TMDB similar titles
- Shared genres
- Shared keywords
- Cast and crew overlap
- Production-country and original-language fit
- Release-era proximity
- Runtime proximity
- Adult and content-rating rules

A recommendation related to two or more independent nominations receives a meaningful cluster bonus.

### 8.6 Diversity Constraints

Unless the room explicitly requests a franchise or genre theme:

- Maximum two titles from the same franchise
- Maximum three titles dominated by the same primary genre in an eight-title pool
- Do not add a sequel when the immediately previous title is unwatched and required for context
- Avoid remakes or duplicate adaptations in the same opening bracket
- Avoid multiple seasons or editions of the same show
- Prefer at least three primary genre groups in Standard and Party games
- Prefer a mix of safe matches and one or two surprising but defensible wildcards

### 8.7 History Signals

Tautulli and Watch Bracket history may contribute:

- Recently watched by the household
- Watched by all known household profiles
- Started but abandoned
- Repeatedly nominated but never selected
- Previously eliminated early
- Recent Watch Bracket winner
- Recently declined on a winner screen

History should influence ranking but remain explainable and configurable.

### 8.8 Reason Codes

Every wildcard stores human-readable reason codes such as:

- Similar to two group picks
- Available in Plex and unwatched
- Fits tonight's 120-minute limit
- Adds comedy to an action-heavy bracket
- Popular with this household
- Available on two selected services
- A close match for the group's preferred decade
- Requestable through Seerr

The winner screen and optional candidate details use these reasons. Raw algorithm weights do not need to be shown to guests.

### 8.9 Recommendation Failure Fallback

If integrations cannot produce enough valid candidates:

1. Relax soft diversity constraints.
2. Expand TMDB recommendation pages.
3. Widen runtime tolerance by a configured amount.
4. Use popular titles only within enabled availability sources.
5. Reduce the target bracket size if all direct nominations still fit.
6. Ask the host to adjust rules rather than silently including unavailable titles.

---

## 9. Media Integrations

### 9.1 TMDB

TMDB provides canonical metadata and broad recommendation inputs:

- Multi-search
- Movie and TV details
- Posters and backdrops
- Genres and keywords
- Recommendations and similar titles
- External IDs
- Content ratings and certifications
- Watch-provider availability
- Trending and discovery fallbacks

Requirements:

- Cache metadata with clear expiration rules
- Respect API attribution requirements
- Store image paths, not downloaded copyrighted artwork, unless explicitly cached for short-lived presentation performance
- Use Canadian provider-region data by default
- Allow region to be configured by the administrator

### 9.2 Plex

Plex integration provides:

- Selected library discovery
- Movie and show search
- Local availability
- Edition and media metadata
- Plex GUID mapping
- Deep links to details or playback
- Optional collection and playlist signals

The provider must support multiple selected libraries while keeping Family, Kids, and standard libraries distinct.

Do not expose the Plex token to the browser or game API logs.

### 9.3 Tautulli

Tautulli contributes household-level history signals:

- Recently watched titles
- Play counts
- Last watched timestamps
- Active or known users
- Most-watched genres or titles
- In-progress series context where available

Privacy requirements:

- Do not show one participant another person's detailed history
- Convert private history into aggregate recommendation signals
- Let the administrator disable Tautulli scoring entirely
- Treat incomplete identity mapping as unknown rather than guessed

### 9.4 Seerr

Use a provider named `SeerrProvider` with compatibility for Seerr, Jellyseerr, or Overseerr deployments.

Capabilities:

- Search request status
- Determine whether a title is already available, pending, partially available, or requestable
- Submit a movie request
- Submit a television request with explicit season rules
- Return request status and a safe link

Safety rules:

- Automatic requests are disabled by default
- The host must confirm the request unless an administrator enables auto-request
- Never expose the Seerr API key
- Never let public clients choose arbitrary root folders, servers, or quality profiles
- Allowed request parameters come from administrator-controlled integration settings
- TV requests require a clear season policy

### 9.5 V1 Integration Priority

Implement in this order:

1. TMDB metadata and search
2. Plex availability and library filtering
3. Tautulli household history
4. Seerr status and requests
5. External streaming provider filtering through TMDB

Direct Radarr, Sonarr, SABnzbd, qBittorrent, or Prowlarr integrations are not V1 goals. Seerr remains the request boundary.

### 9.6 Provider Adapter Contract

```ts
interface MediaProviderCapabilities {
  search: boolean;
  availability: boolean;
  recommendations: boolean;
  watchHistory: boolean;
  requests: boolean;
  playbackLinks: boolean;
}

interface MediaProvider {
  readonly id: string;
  readonly capabilities: MediaProviderCapabilities;

  healthCheck(): Promise<ProviderHealth>;
  search(input: SearchInput): Promise<NormalizedMediaItem[]>;
  getAvailability(input: AvailabilityInput): Promise<AvailabilityResult[]>;
  getRecommendations?(input: RecommendationInput): Promise<NormalizedMediaItem[]>;
  getHistorySignals?(input: HistoryInput): Promise<HistorySignals>;
  requestMedia?(input: RequestMediaInput): Promise<RequestResult>;
  getPlaybackLink?(input: PlaybackLinkInput): Promise<PlaybackLink | null>;
}
```

No provider adapter may expose a generic arbitrary URL fetch method.

---

## 10. Technical Architecture

### 10.1 Platform decisions

#### Controllers and administration

Use Next.js App Router with TypeScript. The interface is mobile-first, installable as a PWA, and fully usable without installation. Host setup and voting must remain comfortable on a phone held in one hand.

#### Chromecast receiver

Use a small React and Vite application in `apps/cast-receiver`. It loads Google's hosted Cast Receiver SDK, listens on a custom namespace, exchanges a launch token, and renders the server's display scenes.

The receiver must remain deliberately lightweight:

- No Next.js runtime
- No server-side rendering
- No large component framework
- No tournament logic
- No provider credentials
- No direct Plex, Tautulli, Seerr, or TMDB API calls
- WebSocket transport only after authentication
- CSS transforms and opacity for most animation
- Versioned static assets and a conservative cache strategy

#### Browser display

Use a television-optimized route inside the Next.js application. It consumes the same semantic display protocol as the Cast receiver and serves as the fallback and visual-development target.

#### Realtime game server

Use Fastify with Socket.IO. The game API owns room state transitions, deadlines, vote validation, tournament outcomes, authorization, host actions, and display scenes.

#### Media integration service

Use a separate internal Fastify service. It alone holds TMDB, Plex, Tautulli, and Seerr-compatible credentials. The public game API calls a narrow typed internal contract.

#### Persistence and scheduling

Use PostgreSQL as the only required state service in V1.

Do not add Redis merely for a single-instance home deployment. PostgreSQL stores all durable room state, deadlines, pairing sessions, idempotency records, and audit events. A lightweight game-api scheduler claims due transitions with database transactions and `FOR UPDATE SKIP LOCKED`, making every transition idempotent and restart-recoverable.

Ephemeral socket presence may live in process memory because it is reconstructed when clients reconnect. Horizontal scaling is a future concern; a Redis or Valkey Socket.IO adapter can be added later without changing domain contracts.

### 10.2 Recommended monorepo

Use pnpm workspaces with straightforward root scripts. Do not add Turborepo until build performance justifies it.

```text
apps/
  web/
  game-api/
  integration-service/
  cast-receiver/

packages/
  db/
  shared/
  config/
  realtime-protocol/
  display-protocol/
  display-ui/
  tournament-engine/
  recommendation-engine/
  provider-contracts/
  test-utils/

infra/
  caddy/
  cloudflared/
  docker/

docs/
  adr/
  integrations/
  display-protocol/
  cast/
```

`display-ui` may share design tokens, scene layout primitives, and pure React components between the browser display and receiver. It must not pull Next.js-only dependencies into the receiver bundle.

### 10.3 Web application responsibilities

- Landing page and host login
- Room creation and join flows
- Participant controller
- Host controls and persistent Cast status bar
- Search and nominations
- Voting
- Winner actions
- Admin diagnostics and non-secret settings
- Browser display
- PWA manifest and icons
- Presentation Test Mode

Recommended libraries:

- React
- Shared Zod schemas
- TanStack Query for HTTP state
- Socket.IO client for realtime state
- React Hook Form where it reduces form complexity
- Tailwind CSS or CSS modules, selected once at project start
- Motion for React only in the controller or browser display if bundle cost is acceptable

The Cast receiver should prefer CSS and the Web Animations API over a heavy animation dependency.

### 10.4 Cast sender responsibilities

The web host controller:

- Loads the Google Web Sender SDK only for authenticated hosts on supported browsers
- Uses the standard Cast launcher and Cast state model
- Requests a launch token from the game API
- Sends the launch token through `urn:x-cast:live.famflix.watchbracket`
- Shows connected, connecting, disconnected, and reconnecting states
- Provides Resume on TV when the room still has an active receiver session
- Keeps host controls accessible without covering voting controls
- Never sends private votes or provider credentials through the Cast channel

The Cast custom message payload should stay below a few kilobytes. Scene traffic travels over the receiver's direct WebSocket connection, not the Cast channel.

### 10.5 Cast receiver responsibilities

- Load Watch Bracket branding immediately
- Receive and validate the launch envelope
- Exchange the launch token for a receiver session
- Connect directly to the game API
- Request a current snapshot before rendering an active scene
- Render all display scene types
- Preload the next scene's artwork
- Preserve the last valid scene during brief disconnections
- Show a subtle reconnecting state
- Stop after the room ends or prolonged unattached idle time
- Send only safe telemetry such as ready state, scene rendered, and recoverable render errors

### 10.6 Public game API responsibilities

- Host and guest sessions
- Room creation and lifecycle
- Participant presence
- Browser display pairing
- Cast launch-token issuance and exchange
- Cast receiver-session revocation
- Submission validation
- Tournament orchestration
- Vote collection
- Database-backed deadline scheduling
- Winner resolution
- Audit events
- Narrow calls to the internal integration service

### 10.7 Internal integration service responsibilities

- Load credentials from environment or root-owned secret files
- Call TMDB, Plex, Tautulli, and Seerr-compatible APIs
- Normalize provider responses
- Cache safe metadata in PostgreSQL
- Enforce exact configured base URLs
- Apply provider-specific timeouts, retries, and circuit breaking
- Expose only typed operations
- Never provide a generic URL fetch endpoint

V1 should prefer environment-based secret configuration over storing provider tokens in the database. This is simpler and safer for Haden's self-hosted deployment. A future encrypted secret-management UI can be added independently.

### 10.8 Display protocol

Display clients consume semantic scenes rather than database rows.

```ts
type DisplayScene =
  | LobbyScene
  | SubmissionProgressScene
  | BracketBuildScene
  | MatchupIntroScene
  | MatchupVotingScene
  | MatchupResultScene
  | BracketOverviewScene
  | RedemptionRevealScene
  | WinnerScene
  | ReconnectingScene
  | ErrorScene;

interface DisplayEnvelope<TScene extends DisplayScene = DisplayScene> {
  schemaVersion: 1;
  eventId: string;
  roomId: string;
  sequence: number;
  serverTimestamp: string;
  scene: TScene;
}
```

Display scenes must be independent of React, Next.js, Socket.IO implementation types, database rows, and provider response types.

### 10.9 Presentation Test Mode

`/display/test` and a receiver test build should cycle through deterministic scenes without a live room.

Required controls:

- Select any scene
- Advance automatically or manually
- Simulate 720p, 1080p, and 4K canvases
- Simulate missing artwork and slow loading
- Toggle reduced motion and low-power mode
- Simulate reconnecting and stale sequences
- Copy example protocol payloads
- Run without Plex, Seerr, Tautulli, or TMDB credentials

This mode is a major open-source contributor feature, not a throwaway developer page.

## 11. Self-Hosted Network and Deployment Design

### 11.1 Primary deployment path

```text
Internet
  -> Cloudflare edge
  -> outbound Cloudflare Tunnel
  -> existing cloudflared container
  -> existing Caddy container
  -> Watch Bracket web, game API, or static Cast receiver
```

Cloudflare Tunnel uses an outbound connection, so no router port forwarding is required.

### 11.2 Domain routing

Canonical host:

```text
bracket.famflix.live
```

Alias:

```text
vote.famflix.live
```

Recommended Caddy routing:

```text
bracket.famflix.live/api/*          -> game-api
bracket.famflix.live/socket.io/*    -> game-api
bracket.famflix.live/cast/receiver* -> cast-receiver
bracket.famflix.live/*              -> web

vote.famflix.live/*
  308 redirect -> https://bracket.famflix.live{uri}
```

Cloudflare Tunnel must route these public hostnames only to Caddy. It must never route directly to the game API, integration service, PostgreSQL, Plex, Tautulli, Seerr, or any other container.

### 11.3 Docker networks for Haden's existing stack

```text
watchbracket_edge
  existing Caddy
  web
  game-api
  cast-receiver

watchbracket_data, internal
  game-api
  integration-service
  postgres

watchbracket_integrations, internal
  game-api
  integration-service
```

Rules:

- Only Caddy joins the existing Cloudflare ingress path
- `web` joins only `watchbracket_edge`
- `cast-receiver` joins only `watchbracket_edge`
- `game-api` joins edge, data, and integrations
- `integration-service` joins data and integrations
- PostgreSQL joins only the internal data network
- No Watch Bracket service joins unrelated application networks unless explicitly required
- No service uses host networking
- No service mounts `/var/run/docker.sock`

Plex runs on another machine and several integrations run on the NAS. The integration service may reach only the exact configured base URLs. Use `host.docker.internal:host-gateway` or fixed LAN addresses as appropriate, but reject arbitrary destinations at the application layer.

### 11.4 Published ports

Production Compose should publish no Watch Bracket application ports when it is attached to the existing Caddy network.

A development override may bind web, API, receiver, and PostgreSQL to loopback or a trusted LAN interface. The integration service and PostgreSQL must never bind to a public interface.

### 11.5 Cloudflare behavior

- WebSockets must remain enabled
- Do not place Cloudflare Access in front of the public guest, Socket.IO, or Cast receiver routes
- Do not require interactive bot challenges on `/cast/receiver*`, `/api/displays/cast/*`, or `/socket.io/*`
- The initial WebSocket upgrade still receives normal WAF and rate-limit evaluation
- Cache versioned receiver assets aggressively
- Serve the receiver HTML entry point with short cache lifetime or `no-cache`
- Never cache authenticated API responses or room snapshots

### 11.6 Receiver security headers

The receiver requires a deliberately scoped Content Security Policy that permits:

- Google's hosted Cast Receiver SDK from `gstatic.com`
- Watch Bracket API and WebSocket connections
- Approved TMDB image hosts
- Local bundled styles and scripts

Do not reuse a broad general-site CSP. Do not allow arbitrary image, script, or connection origins.

### 11.7 Container hardening

Apply where compatible:

```yaml
read_only: true
cap_drop:
  - ALL
security_opt:
  - no-new-privileges:true
```

Also require:

- Non-root runtime users
- Multi-stage builds
- Minimal runtime images
- `tmpfs` for required temporary directories
- Health checks
- Restart policies
- Conservative CPU and memory limits for the NAS
- No privileged containers
- No broad host filesystem mounts
- Explicit persistent-volume ownership

### 11.8 Secrets

Development:

- `.env.local` or Compose env files excluded from Git
- Fake values only in `.env.example`

Production:

- Root-owned env files or Docker secrets mounted read-only
- Provider tokens available only to the integration service
- Host-session and token peppers available only to the game API
- Values redacted from logs, health responses, and admin diagnostics

V1 does not require provider secrets stored in PostgreSQL. The admin UI may test and report provider status, but secrets are configured through deployment files.

## 12. Security Model

### 12.1 Threat Assumptions

The public app may receive:

- Room-code guessing
- Join spam
- Malformed payloads
- Vote replay attempts
- Session theft attempts
- Pairing-code guessing
- WebSocket flooding
- Image URL abuse
- Attempts to turn provider calls into SSRF
- Attempts to trigger arbitrary Seerr requests
- Cast launch-token theft or replay
- A malicious or stale display client attempting controller actions

### 12.2 Mandatory Controls

- Zod validation for environment, HTTP, job, provider, and WebSocket payloads
- Cryptographically secure room codes and session tokens
- Store only hashes of participant, host, browser-display, and Cast launch tokens
- HTTP-only, secure, same-site cookies
- CSRF protection for cookie-authenticated mutations
- Origin validation for WebSockets
- Rate limits for room creation, joining, pairing, search, and voting
- Request body size limits
- Strict Content Security Policy
- Security headers through Caddy and application responses
- Safe external-image allowlist or image proxy
- No generic upstream fetch endpoint
- No user-controlled provider base URL outside administrator settings
- No user-controlled provider headers
- Idempotency keys for critical mutations
- Audit events for host and administrative actions
- Short room retention by default
- Browser display and Cast receiver sessions are read-only, room-scoped, and revocable
- Cast launch tokens are single-use and expire within 60 seconds
- Receiver access tokens are never placed in URLs or logs
- Private room state is never exposed by room code alone

### 12.3 Room Codes

Room codes are discoverability handles, not authorization secrets.

Joining still creates a participant session. Host actions require the host session. Display access requires a paired display session.

Use an unambiguous alphabet such as:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

### 12.4 Administrative Access

V1 uses one or more local administrator accounts.

Requirements:

- Passwords hashed with Argon2id
- Secure session cookies
- Login rate limiting
- Optional TOTP or passkey support after core V1
- Re-authentication before revealing or replacing sensitive integration settings
- Optional Cloudflare Access protection for `/admin`, documented but not required

### 12.5 Retention

Suggested defaults:

- Expired guest sessions: 7 days
- Completed room details: 30 days
- Aggregate household preference signals: retained until deleted
- Raw votes: configurable, default 30 days
- Provider response cache: based on provider and data type
- Audit logs: 90 days

The administrator can delete room history and household-derived preference data.

---

## 13. Data Model

All tables use UUID primary keys, UTC timestamps, explicit foreign keys, and appropriate indexes.

### `admin_users`

- `id`
- `email` or `username`
- `password_hash`
- `role`
- `created_at`
- `updated_at`
- `last_login_at`

### `households`

- `id`
- `name`
- `region`
- `timezone`
- `default_rules_json`
- `created_at`
- `updated_at`

### `integrations`

- `id`
- `household_id`
- `provider_type`
- `display_name`
- `base_url`
- `credential_source`, such as environment or mounted secret file
- `configuration_json`
- `enabled`
- `last_health_status`
- `last_health_checked_at`
- `created_at`
- `updated_at`

### `rooms`

- `id`
- `household_id`
- `code`
- `name`
- `state`
- `rules_json`
- `random_seed`
- `host_participant_id`
- `locked_at`
- `started_at`
- `completed_at`
- `expires_at`
- `created_at`
- `updated_at`

Indexes:

- Unique active room code
- State and expiration
- Household and created date

### `participants`

- `id`
- `room_id`
- `nickname`
- `nickname_normalized`
- `avatar_key`
- `accent_key`
- `session_token_hash`
- `role`
- `connected`
- `ready`
- `joined_at`
- `last_seen_at`
- `removed_at`

### `display_sessions`

- `id`
- `room_id`
- `kind`, `BROWSER` or `CAST`
- `display_name`
- `session_token_hash`
- `status`
- `paired_by_participant_id`
- `last_sequence`
- `last_seen_at`
- `revoked_at`
- `expires_at`
- Timestamps

The session is always read-only. Cast sessions normally store the active receiver identifier and sender-visible device label only when safe and useful. Do not persist hardware identifiers unnecessarily.

### `display_pairing_codes`

- `id`
- `room_id`
- `code_hash`
- `kind`, browser display only in V1
- `attempt_count`
- `expires_at`
- `consumed_at`
- Timestamps

### `cast_launch_tokens`

- `id`
- `room_id`
- `issued_to_host_session_id`
- `token_hash`
- `protocol_version`
- `expires_at`
- `consumed_at`
- `receiver_session_id`, nullable until exchange
- Timestamps

Cast launch rows may be deleted quickly after consumption. They exist for replay prevention and auditability, not long-term analytics.

### `media_items`

- `id`
- `media_type`
- `tmdb_id`
- `imdb_id`
- `tvdb_id`
- `title`
- `original_title`
- `release_date`
- `runtime_minutes`
- `content_rating`
- `genres_json`
- `keywords_json`
- `poster_path`
- `backdrop_path`
- `metadata_json`
- `metadata_expires_at`
- `created_at`
- `updated_at`

Unique key: media type plus TMDB ID.

### `provider_media_refs`

- `id`
- `media_item_id`
- `integration_id`
- `provider_item_id`
- `provider_guid`
- `provider_metadata_json`
- `last_verified_at`

### `submissions`

- `id`
- `room_id`
- `participant_id`
- `media_item_id`
- `rank`
- `locked_at`
- `created_at`
- `updated_at`

Unique key: room, participant, rank.

### `availability_snapshots`

- `id`
- `room_id`
- `media_item_id`
- `source_type`
- `source_id`
- `status`
- `details_json`
- `checked_at`
- `expires_at`

### `candidates`

- `id`
- `room_id`
- `media_item_id`
- `source_type`
- `score_total`
- `score_components_json`
- `reason_codes_json`
- `seed`
- `strikes`
- `status`
- `created_at`

### `rounds`

- `id`
- `room_id`
- `stage`
- `sequence`
- `status`
- `started_at`
- `completed_at`

### `matchups`

- `id`
- `room_id`
- `round_id`
- `sequence`
- `candidate_a_id`
- `candidate_b_id`
- `winner_candidate_id`
- `status`
- `voting_starts_at`
- `voting_ends_at`
- `resolved_at`
- `resolution_json`

### `votes`

- `id`
- `matchup_id`
- `participant_id`
- `candidate_id`
- `submitted_at`
- `updated_at`

Unique key: matchup plus participant.

### `media_requests`

- `id`
- `room_id`
- `media_item_id`
- `integration_id`
- `requested_by_participant_id`
- `provider_request_id`
- `status`
- `request_payload_json`
- `provider_response_json`
- `created_at`
- `updated_at`

### `room_events`

- `id`
- `room_id`
- `sequence`
- `event_type`
- `schema_version`
- `payload_json`
- `created_at`

This event log supports reconnect snapshots, debugging, and future replay features. It is not required to be a complete event-sourced architecture.

### `audit_events`

- `id`
- `household_id`
- `room_id`
- `actor_type`
- `actor_id`
- `action`
- `safe_metadata_json`
- `request_id`
- `created_at`

---

## 14. Room State Machine

```text
LOBBY
  -> NOMINATING
  -> BUILDING_CANDIDATES
  -> READY_TO_START
  -> MATCHUP_INTRO
  -> VOTING
  -> MATCHUP_RESULT
  -> BRACKET_TRANSITION
  -> MATCHUP_INTRO, repeated
  -> WINNER
  -> COMPLETED

Any active state
  -> PAUSED
  -> previous resumable state

LOBBY or COMPLETED
  -> EXPIRED

Recoverable integration failure
  -> PAUSED or host decision

Fatal room failure
  -> FAILED
```

Rules:

- State transitions occur only in the game API
- Every mutation checks current state and expected version
- Transition handlers are idempotent
- Timers use server deadlines
- PostgreSQL row locking and idempotency constraints prevent duplicate transition execution
- Durable state is written before publication
- Reconnecting clients receive a fresh snapshot rather than replaying every missed animation

---

## 15. HTTP API Outline

All public responses use versioned DTOs. All errors use:

```ts
interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}
```

### 15.1 Public and Guest Endpoints

```text
POST   /api/rooms
POST   /api/rooms/join
GET    /api/rooms/:roomId/snapshot
POST   /api/rooms/:roomId/leave
GET    /api/rooms/:roomId/search
POST   /api/rooms/:roomId/submissions
DELETE /api/rooms/:roomId/submissions/:submissionId
POST   /api/rooms/:roomId/submissions/lock
POST   /api/matchups/:matchupId/vote
GET    /api/rooms/:roomId/winner
```

### 15.2 Host Endpoints

```text
PATCH  /api/rooms/:roomId/rules
POST   /api/rooms/:roomId/lock
POST   /api/rooms/:roomId/unlock
POST   /api/rooms/:roomId/start
POST   /api/rooms/:roomId/pause
POST   /api/rooms/:roomId/resume
POST   /api/rooms/:roomId/skip-matchup
DELETE /api/rooms/:roomId/participants/:participantId
POST   /api/rooms/:roomId/co-hosts/:participantId
POST   /api/rooms/:roomId/displays/pairing-code
POST   /api/rooms/:roomId/displays/:displaySessionId/revoke
POST   /api/rooms/:roomId/run-it-back
```

### 15.3 Display and Cast Endpoints

```text
POST /api/displays/pair
GET  /api/displays/:displaySessionId/snapshot
POST /api/displays/:displaySessionId/heartbeat
```

Display endpoints enforce read-only authorization.

### 15.4 Admin Endpoints

```text
POST   /api/admin/session
DELETE /api/admin/session
GET    /api/admin/integrations
POST   /api/admin/integrations
PATCH  /api/admin/integrations/:integrationId
DELETE /api/admin/integrations/:integrationId
POST   /api/admin/integrations/:integrationId/test
GET    /api/admin/presets
POST   /api/admin/presets
PATCH  /api/admin/presets/:presetId
GET    /api/admin/operations/health
DELETE /api/admin/history
```

### 15.5 Health Endpoints

```text
GET /health/live
GET /health/ready
GET /health/integrations, protected
```

---

## 16. Realtime Protocol

### 16.1 Client to Server

```text
room:subscribe
participant:heartbeat
participant:ready
submission:progress
matchup:subscribe
display:subscribe
display:heartbeat
```

HTTP remains the preferred path for authoritative mutations such as votes and host actions. Socket.IO publishes state and low-risk presence signals.

### 16.2 Server to Controller

```text
room:snapshot
room:state-changed
room:participant-joined
room:participant-left
room:participant-reconnected
room:participant-updated
room:locked
room:unlocked
nomination:started
nomination:progress
nomination:completed
candidate-build:progress
matchup:started
matchup:vote-accepted
matchup:result
bracket:updated
room:paused
room:resumed
room:winner
display:paired
display:revoked
room:error
```

### 16.3 Server to Display

```text
display:snapshot
display:scene
display:revoked
display:error
```

Every server event contains:

- `schemaVersion`
- `eventId`
- `roomId`
- `sequence`
- `serverTimestamp`
- Event-specific payload

Clients ignore events older than their current sequence and request a snapshot when a gap is detected.

---

## 17. Shared Display, Cast, and Visual Specification

### 17.1 One presentation system, two display clients

The browser display and Custom Web Receiver render the same semantic scenes. They may use different implementation details, but must remain visually and behaviorally consistent.

The display never exposes private nominations before reveal, individual votes, host credentials, or provider tokens.

### 17.2 Presentation canvas

- Design around a fixed 16:9 safe canvas
- Support 1280x720 and 1920x1080 as required targets
- Treat 4K as scaled 1080p layout rather than a separate information density
- Maintain overscan-safe margins
- Avoid controls requiring a mouse after pairing
- Keep critical text readable from approximately three metres away
- Use artwork sizes appropriate to the actual viewport
- Avoid continuous high-cost blur filters on low-power receivers

### 17.3 Reliability

- Independent authenticated WebSocket connection
- WebSocket-only transport on the Cast receiver
- Automatic reconnect with bounded exponential backoff and jitter
- Full snapshot after reconnect or sequence gap
- Preserve the last valid scene during brief outages
- Clear but non-alarming reconnecting indicator
- Poster and backdrop preloading
- Image-error fallback artwork
- Reduced-motion mode
- Low-power animation mode
- Server timestamps for countdowns
- No animation callback may advance game state

The browser display should request Screen Wake Lock when supported and re-request it after visibility returns. Fullscreen is best effort because browser support varies.

### 17.4 Cast receiver lifecycle

Receiver states:

```ts
type CastReceiverState =
  | "BOOTING"
  | "WAITING_FOR_LAUNCH_TOKEN"
  | "EXCHANGING_TOKEN"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "ROOM_COMPLETE"
  | "SESSION_REVOKED"
  | "FATAL_ERROR";
```

Lifecycle rules:

- Show branding immediately, not a blank screen
- Stop if no valid launch token arrives within 60 seconds
- Keep the receiver alive while an active room is attached
- Do not stop merely because the sender browser is temporarily suspended
- Stop after five minutes without an active room
- After a winner, remain available for Run It Back for five minutes
- Allow the host to disconnect intentionally
- On fatal protocol mismatch, show a human-readable update message and stop safely

### 17.5 Host controller while casting

The host phone displays a persistent but compact TV status strip:

```text
Living Room TV connected
Matchup 3 of 9 · 3/4 votes received
[Host controls] [Disconnect]
```

During a vote, the host's own matchup takes priority. Host controls open in a separate sheet and never reveal the current vote split.

Host controls:

- Start the next phase
- Pause between matchups
- Extend the current timer, with a visible notice to everyone
- Skip a broken animation without changing the result
- Replace a broken candidate before its first matchup
- Remove an abusive or disconnected participant
- Resume or disconnect the television
- End the room

The host cannot force a title to win or alter submitted votes.

### 17.6 Matchup presentation

Suggested sequence:

1. Stage card or bracket context appears
2. First poster enters
3. Second poster enters from the opposite side
4. Titles and concise metadata settle
5. Server-authoritative timer begins
6. Vote-received count updates discreetly
7. Final five seconds become visually urgent without flashing
8. Result locks
9. Vote split appears without participant names
10. Losing title exits and the winner advances into the bracket

Animations should normally use transform and opacity. Long sequences must be skippable by the host without changing deadlines or state.

### 17.7 V1 visual themes

Ship one highly polished default theme before adding customization.

Default art direction:

- Dark theatre background
- Warm spotlight accents
- Poster cards with subtle dimensional depth
- Blurred, darkened backdrop wash from the competing titles
- Clear availability badges
- Distinct redemption accent
- Minimal chrome during voting

### 17.8 Difference-making presentation features

#### Poster Curtain Reveal

The television teases silhouettes and accent colours before revealing both titles.

#### Dynamic Backdrop Wash

Use the TMDB backdrop itself as a blurred, darkened environmental layer. Do not expose Plex artwork URLs or tokens to public clients.

#### Redemption Reveal

A strong eliminated title returns through a visibly different second-chance animation and badge.

#### Bracket Flyover

Between stages, zoom out to show the path and zoom back to the next matchup. Keep this short enough that the game never feels stalled.

#### Winner Journey

The winner scene briefly traces every title it defeated, including whether it returned through redemption.

#### Group Taste Snapshot

Show a deterministic recap such as dominant genres, closest matchup, surprise wildcard, and degree of consensus.

### 17.9 Accessibility

- Controller UI meets WCAG 2.2 AA where practical
- Do not use colour as the only state indicator
- Minimum 44px touch targets
- Screen-reader labels for all voting and host controls
- Visible keyboard focus
- Reduced-motion mode removes large movement but preserves state clarity
- Avoid high-frequency flashes
- Timer warnings include text and shape changes
- Provide sufficient text contrast over artwork
- Allow explicit abstention

---

## 18. High-Value Micro Features

### Tonight Ends At

The host enters a desired end time. Runtime filtering accounts for the current time and optional setup buffer.

### No Repeats

Exclude recent Watch Bracket winners and recently watched titles for a configurable period.

### One Dealbreaker

Each participant may block one title before the tournament. To prevent abuse, this is visible to the group after nominations close and may be disabled by the host.

### Blind Picks

Hide title names during the first few seconds and initially reveal only poster art, genres, year, or a short clue.

### Run It Back

Start another room with the same participants, integrations, and rules while excluding the previous winner and optionally all prior candidates.

### Next Episode Helper

When a TV show wins and Plex history is available, resolve the next sensible episode for the host household profile.

### Request and Chill

When a requestable title wins, confirm the Seerr request, show status, and optionally offer a reminder outside V1.

### Group Taste Snapshot

Generate a deterministic post-game summary using votes, nominations, and genres. No LLM is required.

### Host Rescue

The host can replace a candidate before the first matchup if artwork or metadata is clearly broken. Every replacement is logged and visible.

### Private Abstain

A participant can explicitly abstain. The display shows vote completion without exposing who abstained.

### Spectator Mode

A participant can join as a spectator who sees controller status but cannot nominate or vote. Optional for late arrivals.

---

## 19. Failure and Edge Cases

### Participant disconnects

Keep the participant eligible through the current deadline. Mark disconnected status privately to the host. Restore the session on reconnect.

### Browser display disconnects

The game continues. The display reconnects and receives the current scene snapshot.


### Cast sender disconnects

The receiver remains attached to the active room and continues receiving scenes directly from the server. Reopening the host controller restores Cast status when the browser can rejoin the existing session. An explicit Disconnect action revokes the receiver session.

### Cast receiver restarts

The receiver returns to the waiting state. The host sees Resume on TV and issues a fresh single-use launch token. The room and participant sessions remain unchanged.

### Cast SDK unavailable

Hide or disable the Cast launcher with a concise explanation. Offer Open Browser Display instructions instead of presenting a broken control.

### Game API restarts

Rebuild active room state from PostgreSQL. Recalculate pending deadlines from stored timestamps. Never replay a resolved matchup.

### Integration service unavailable

- Existing active tournament continues from stored candidate data
- New search and candidate generation show a recoverable error
- Host can retry or switch to direct nominations only

### TMDB rate limit or outage

Use cached metadata where safe. Do not silently substitute incorrect titles.

### Plex unavailable

Mark availability as temporarily unverified. In Watch Now mode, require host confirmation before starting if availability cannot be trusted.

### Seerr request failure

Keep the winner. Show a clear retryable error and do not claim the request succeeded.

### Too few nominations

Fill from recommendations. If integrations are unavailable, allow a smaller four-title fallback bracket only as an explicit degraded mode.

### Too many nominations

Auto-expand up to sixteen candidates. If more than sixteen first-choice nominations exist, require one nomination per participant or a short qualification vote.

### Duplicate title across providers

Merge by canonical identity and show all valid availability sources.

### TV season ambiguity

The winner is the series. Request or playback action must clearly state the selected or next season policy.

### Tie with absent voters

Apply the stored tie-break policy at the deadline. Do not wait indefinitely.

### Missing artwork

Use branded fallback artwork with title and year. Never collapse the layout.

### Clock skew

Use server deadlines. Clients display remaining time based on a server-time offset refreshed during the room.

---

## 20. Observability and Operations

### 20.1 Logs

Use structured Pino logs containing:

- Timestamp
- Level
- Service
- Request ID
- Room ID when safe
- Event type
- Duration
- Error code

Never log:

- Cookies
- Session tokens
- Provider secrets
- Complete request bodies
- Sensitive watch-history details

### 20.2 Metrics

Useful metrics:

- Active rooms
- Connected participants
- Connected displays
- Room completion rate
- Average game duration
- Vote timeout rate
- Search latency
- Candidate generation latency
- Provider error rate
- WebSocket reconnects
- Seerr request success rate
- Cache hit rate

Prometheus export is optional for V1. A protected operations page is sufficient initially.

### 20.3 Health Checks

- Liveness checks process health only
- Readiness checks database connectivity and required service configuration
- Integration health is reported separately and does not necessarily make the public app unready
- Health responses expose no secrets or internal URLs

### 20.4 Backups

Back up:

- PostgreSQL
- Non-secret integration configuration and provider identifiers
- Administrator and preset data
- Deployment configuration without secrets

PostgreSQL is the durable source of truth. In-memory presence and timers must be reconstructable.

### 20.5 Updates

- Pin application dependencies in the lockfile
- Pin container images to stable versions or digests for production
- Use GitHub Actions to build and test images
- Document migrations and rollback considerations
- Provide a versioned changelog before public release

---

## 21. Milestones

Each milestone must end in a usable vertical slice, automated checks, updated documentation, and a manual acceptance run. Do not start the next milestone with failing tests or known data-loss bugs.

### Milestone 0: Repository and deployment foundation

Deliverables:

- pnpm TypeScript monorepo
- Next.js web app
- Fastify game API
- Internal integration-service shell
- React/Vite Cast receiver shell
- Shared configuration and protocol packages
- PostgreSQL and Drizzle migrations
- Development and production Compose files
- Existing-Caddy integration example
- `bracket.famflix.live` routing
- `vote.famflix.live` permanent redirect
- Cloudflare Tunnel guidance
- Docker network isolation
- Health endpoints
- CI for lint, typecheck, tests, builds, and container builds
- Security, deployment, and ADR documentation

Acceptance criteria:

- Local stack starts with one command
- Production publishes no internal application ports
- Caddy cannot route to the integration service or PostgreSQL
- Cast receiver static page loads through the canonical HTTPS origin
- Repository contains no real secrets

### Milestone 1: Host authentication, rooms, lobby, and browser display

Deliverables:

- Bootstrap household admin account
- Persistent host login
- Create and join room
- Host automatically joins as participant
- Six-character room codes and QR join link
- Real-time presence
- Lock and unlock room
- Participant reconnection
- Browser display pairing and revocation
- Lobby scene
- Basic PWA metadata
- Database-backed expiration scheduler

Acceptance criteria:

- A host can create a room from a phone
- Two guest browsers join without accounts
- Refresh does not duplicate participants
- A browser display updates independently of the host controller
- Display authorization cannot invoke controller or host actions
- Restarting the API reconstructs the lobby and room expiration safely

### Milestone 2: Chromecast couch experience

Deliverables:

- Google Cast developer registration documentation
- Web Sender SDK loaded only for supported authenticated hosts
- Standard Cast launcher and introduction hint
- Single-use launch-token issuance
- Custom Cast namespace
- Receiver token exchange
- Direct receiver Socket.IO connection using WebSocket transport
- Lobby rendering on Chromecast
- Host connected-TV status strip
- Resume, disconnect, and revoke flows
- Receiver lifecycle and idle handling
- Mock Presentation Test Mode in the receiver

Acceptance criteria:

1. Create a room from Android Chrome.
2. Launch the receiver on a physical Chromecast or Cast-enabled television.
3. Join from at least two additional phones.
4. Lock the host phone briefly.
5. Confirm the TV remains connected and updates.
6. Reopen the host controller and recover host controls.
7. Disconnect intentionally and confirm the receiver stops.

Desktop Chrome must also be tested. iOS browser launch is documented as unsupported.

### Milestone 3: Mock catalog and nomination flow

Deliverables:

- Deterministic mock movie and TV catalog
- Search UI
- Two ranked nomination slots
- Duplicate merge and support counts
- Submission timer
- Lock and edit submissions before deadline
- Shared-display progress
- House-rule presets
- Host extension flow

Acceptance criteria:

- A complete nomination phase works without external providers
- Private nominations remain private until the configured reveal
- Server owns the nomination deadline
- Reconnect restores current submissions and timer
- Cast and browser displays show equivalent progress scenes

### Milestone 4: Double-Take tournament engine

Deliverables:

- Pure tournament-engine package
- Eight, twelve, and sixteen-title formats
- Deterministic seeding
- Server-authoritative voting deadlines
- Vote update and abstain
- Tie handling
- Redemption selection
- Championship path
- Database-backed transition scheduler
- Recovery after API restart
- Full display scene sequence

Acceptance criteria:

- Property and unit tests cover bracket invariants
- No candidate appears in an invalid simultaneous matchup
- A matchup resolves once even after retries
- A complete mock game runs from nominations to winner on Chromecast
- Restart recovery does not change the bracket path

### Milestone 5: TMDB metadata, streaming availability, and recommendations

Deliverables:

- TMDB provider
- Canonical media model
- Metadata and artwork cache
- Movie and TV search
- Similar, recommendation, and discover candidate sources
- Canadian watch-provider data
- JustWatch attribution
- Candidate scoring
- Diversity constraints
- Reason codes
- Admin recommendation-debug view

Acceptance criteria:

- Every wildcard stores source, score components, and reasons
- Hard room filters cannot be bypassed by fallback logic
- Duplicate canonical titles merge correctly
- Candidate generation is reproducible for stored room seed and cached inputs
- Streaming badges distinguish subscription, free-with-ads, rent, and buy

### Milestone 6: Plex, Tautulli, and Seerr-compatible integrations

Deliverables:

- Plex library discovery and scheduled inventory sync
- TMDB GUID mapping and local availability
- Partial TV availability model
- Tautulli aggregate watch-history signals
- Seerr, Jellyseerr, or Overseerr-compatible adapter with capability probe
- Existing request status
- Host-confirmed movie requests
- Host-selected TV season request policy
- Provider health, timeout, retry, and circuit-breaker behavior

Acceptance criteria:

- No media token appears in browser traffic or public logs
- Watch Now excludes known unavailable titles
- Hybrid labels requestable titles throughout the game
- Provider base URLs cannot be changed by guest input
- Seerr requests are constrained to the winning canonical title and configured server rules
- Provider outage degrades gracefully instead of killing an active room

### Milestone 7: Winner actions, household memory, and replay

Deliverables:

- Winner Journey presentation
- Open in Plex action when resolvable
- Host-confirmed Seerr request flow
- QR winner action
- Run It Back
- Recent winner and candidate exclusion
- Watch Bracket history signals
- Group Taste Snapshot
- Optional Continue-a-Show helper if provider data proves reliable

Acceptance criteria:

- Winner availability and next action are unambiguous
- Request success is verified before confirmation is shown
- Run It Back creates a clean room with carried-forward participants and rules
- Household history can be disabled and cleared

### Milestone 8: UX polish, reliability, and accessibility

Deliverables:

- Final default visual theme
- Poster Curtain Reveal
- Matchup transitions
- Redemption reveal
- Bracket flyover
- Winner celebration
- Asset preloading
- Low-power receiver mode
- Reduced motion
- Optional haptics and sound framework
- Controller accessibility review
- Browser display wake-lock and fullscreen fallbacks
- Empty, loading, timeout, and offline states

Acceptance criteria:

- Animations never determine game state
- Missing artwork never breaks a scene
- A full game remains understandable with reduced motion
- Voting is easy on a small phone
- Receiver remains smooth on the physical target Chromecast
- A normal two-to-four-person game finishes in roughly 8 to 15 minutes

### Milestone 9: Production hardening and open-source preparation

Deliverables:

- Abuse and rate-limit review
- CSRF, origin, and CSP review
- Dependency and container scanning
- Backup and restore test
- Upgrade and rollback documentation
- License decision
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- Issue and pull-request templates
- Provider-adapter guide
- Display and Cast protocol guides
- Demo screenshots or video
- Public roadmap

Acceptance criteria:

- Fresh installation succeeds from documentation
- Backup restore succeeds on a clean stack
- Security checklist is complete
- No private FamFlix credentials, addresses, or infrastructure details are committed
- Contributors can run a complete mock game and Presentation Test Mode without a media server

## 22. V1 Definition

V1 is complete when:

- Watch Bracket is reachable at `https://bracket.famflix.live`
- `https://vote.famflix.live` redirects correctly
- A trusted host can create a room from an Android phone
- The host is also a normal participant
- Guests join without accounts
- The host launches a Custom Web Receiver from Android Chrome
- The receiver continues independently during temporary host-phone suspension
- A browser display fallback pairs securely
- Every participant submits up to two choices
- Watch Bracket adds explainable wildcard recommendations
- Plex availability affects candidate eligibility
- Tautulli history reduces repeats without exposing individual history
- Seerr-compatible request status and host-confirmed requests work
- Eight, twelve, and sixteen-title Double-Take tournaments work
- Votes, deadlines, and advancement are server-authoritative
- The winner screen provides a clear action
- The full stack is isolated behind Caddy and Cloudflare Tunnel
- No unrelated NAS service is exposed
- A complete household game passes the physical-device acceptance test

## 23. Non-Goals for V1

- Native TV applications
- Native phone applications
- Web-based iPhone-to-Chromecast launch support, which the platform does not provide
- Roku, Tizen, or webOS clients
- Multi-household SaaS hosting
- Public social profiles
- Chat or voice communication
- Direct Sonarr, Radarr, download-client, or filesystem control
- Automatic trailer playback
- LLM-generated recommendations
- DRM playback inside Watch Bracket
- Replacing Plex or a streaming provider's playback interface
- Horizontal game-api scaling
- A plugin marketplace

## 24. Future Roadmap

Potential community or later work:

- Native iOS sender for first-class iPhone-to-Chromecast launch support
- Expo and `react-native-tvos` Apple TV and Android TV client
- Roku client
- Samsung Tizen client
- LG webOS client
- Cast Connect Android TV receiver
- Home Assistant integration
- Companion Discord bot
- Scheduled recurring movie-night rooms
- Remote friend-group mode
- Multiple households and portable profiles
- Additional media servers such as Jellyfin or Emby
- Additional request systems
- Ranked-choice or cooperative modes
- Local-only natural-language rule parser outside the core recommendation path
- Redis or Valkey adapter if horizontal scaling is ever required

Future display clients must consume the existing display protocol and cannot own tournament behavior.

## 25. Suggested Repository Structure

```text
watch-bracket/
  apps/
    web/
      app/
        (public)/
        admin/
        display/
        join/
        room/
      components/
      features/
      lib/
      public/
    game-api/
      src/
        auth/
        displays/
        rooms/
        scheduler/
        sockets/
        votes/
    integration-service/
      src/
        providers/
          plex/
          seerr/
          tautulli/
          tmdb/
        cache/
        http/
    cast-receiver/
      src/
        cast/
        scenes/
        transport/
      public/
  packages/
    config/
    db/
    display-protocol/
    display-ui/
    provider-contracts/
    realtime-protocol/
    recommendation-engine/
    tournament-engine/
    shared/
    test-utils/
  infra/
    caddy/
    cloudflared/
    docker/
  docs/
    adr/
    cast/
    display-protocol/
    integrations/
    DEPLOYMENT.md
    SECURITY.md
    SPEC.md
  .github/
    workflows/
  compose.dev.yml
  compose.prod.yml
  .env.example
  README.md
  pnpm-workspace.yaml
  package.json
```

## 26. Initial Environment Variables

```text
NODE_ENV
PUBLIC_APP_URL=https://bracket.famflix.live
PUBLIC_ALIAS_URL=https://vote.famflix.live
DATABASE_URL

HOST_SESSION_PEPPER
PARTICIPANT_SESSION_PEPPER
DISPLAY_SESSION_PEPPER
CSRF_SECRET
ADMIN_BOOTSTRAP_EMAIL
ADMIN_BOOTSTRAP_PASSWORD

GAME_API_INTERNAL_URL
INTEGRATION_SERVICE_INTERNAL_URL
INTEGRATION_SERVICE_SHARED_SECRET

CAST_RECEIVER_APP_ID
CAST_NAMESPACE=urn:x-cast:live.famflix.watchbracket
CAST_RECEIVER_PATH=/cast/receiver/
CAST_LAUNCH_TOKEN_TTL_SECONDS=60

TMDB_API_READ_TOKEN
TMDB_REGION=CA
TMDB_LANGUAGE=en-CA
TMDB_IMAGE_BASE_URL

PLEX_BASE_URL
PLEX_TOKEN
PLEX_MACHINE_IDENTIFIER
PLEX_LIBRARY_IDS

TAUTULLI_BASE_URL
TAUTULLI_API_KEY

SEERR_BASE_URL
SEERR_API_KEY
SEERR_DEFAULT_MOVIE_SERVER_ID
SEERR_DEFAULT_TV_SERVER_ID

ROOM_CODE_LENGTH=6
ROOM_MAX_PARTICIPANTS=8
ROOM_TTL_HOURS=12
VOTE_DURATION_SECONDS=30
SUBMISSION_DURATION_SECONDS=120
COMPLETED_ROOM_RETENTION_DAYS=30
```

Rules:

- `.env.example` contains fake values only
- Provider credentials are injected only into the integration-service container
- Game-session secrets are injected only into the game-api container
- Public build variables contain no credentials
- Cast application IDs are identifiers, not secrets
- Library and server IDs are administrator configuration, never guest input

## 27. Definition of Done for Every Milestone

Every milestone must include:

- TypeScript strict-mode success
- Lint success
- Relevant unit tests
- Relevant integration tests
- Updated database migrations
- Updated API and protocol schemas
- Updated documentation
- No secrets in source or test fixtures
- Error and loading states
- Accessibility consideration
- Structured logging
- Security-boundary review
- Docker build validation
- Manual smoke-test steps
- A clear list of deliberate deferrals

Do not claim a check passed unless it was actually executed.

---

## 28. Final Product Decision Summary

Watch Bracket is a self-hosted TypeScript application optimized for Haden's actual living-room workflow.

The best V1 experience is:

1. Open `bracket.famflix.live` on an Android phone.
2. Create a room and join automatically as host and participant.
3. Tap Cast and select the living-room television.
4. Let everyone else join through the QR code.
5. Submit two choices each.
6. Watch the server build a smart, availability-aware bracket.
7. Vote privately through animated Double-Take rounds.
8. Open the Plex winner or confirm its Seerr request.

The architecture stays intentionally contained: Next.js for controllers and browser fallback, Fastify for authoritative game state, a small Custom Web Receiver for Chromecast, a separate internal media-integration service, and PostgreSQL as the only required state dependency.

Native television and phone apps remain future extension points. Chromecast is not deferred because it directly creates the couch-first experience this project is meant to deliver.

---

## 29. Verified Platform and Integration References

The following official sources were reviewed while finalizing this specification on August 2, 2026:

- Google Cast Web Sender setup and supported platforms: https://developers.google.com/cast/docs/web_sender
- Google Cast Web Sender integration: https://developers.google.com/cast/docs/web_sender/integrate
- Google Custom Web Receiver requirements: https://developers.google.com/cast/docs/web_receiver/basic
- Google Cast custom message namespaces: https://developers.google.com/cast/docs/web_receiver/core_features
- Google Cast receiver idle option for non-media apps: https://developers.google.com/cast/docs/reference/web_receiver/cast.framework.CastReceiverOptions
- Google Cast registration: https://developers.google.com/cast/docs/registration
- TMDB API: https://developer.themoviedb.org/docs/getting-started
- TMDB watch providers and JustWatch attribution: https://developer.themoviedb.org/reference/movie-watch-providers
- Seerr API authentication and endpoints: https://docs.seerr.dev/api/seerr-api/
- Tautulli API reference: https://docs.tautulli.com/extending-tautulli/api-reference
- Plex Media Server API: https://developer.plex.tv/
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Cloudflare WebSocket support: https://developers.cloudflare.com/network/websockets/
- Caddy reverse proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Screen Wake Lock: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- Fullscreen API: https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
