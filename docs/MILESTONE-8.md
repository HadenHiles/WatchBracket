# Milestone 8: UX polish, reliability, and accessibility

Milestone 8 adds presentation energy without moving any game decision out of the authoritative server state machine.

## Motion system

- Scene fades and matchup card entrances are keyed only to received scene types.
- Redemption candidates use a distinct second-chance reveal.
- Winner scenes add a poster reveal, short bracket-path flyover, and decorative confetti.
- Controller results, candidate tapes, and winner art use restrained video-store-style motion.
- Every animation is disabled by `prefers-reduced-motion`; Presentation Test Mode can also force low-power rendering.
- The Cast receiver automatically selects low-power behavior on reduced-motion or low-concurrency devices.

Missing posters remain optional contract fields and never control layout or game progress. Controllers and displays preload known upcoming poster URLs after each snapshot.

## Device experience

- Browser displays request a screen wake lock, reacquire it after visibility changes, expose a fullscreen fallback, and report offline/reconnecting state.
- A ten-second slow-loading state gives recovery instructions instead of leaving an unexplained spinner.
- Optional sound and haptic feedback is off by default, stored only in the browser, and never changes server state.
- Voting choices expose `aria-pressed`, connection changes use a polite live region, focus rings are visible, and touch controls meet a 44-pixel minimum target.

Reduced motion preserves every title, deadline, vote status, result, winner action, and replay control in text.
