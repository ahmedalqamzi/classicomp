# Classicomp — round 3: 20 Steam-store adjustments (four-AI review)

Compiled 2026-08-15 from four parallel review lanes run against fresh
screenshots of the running app: Visual parity (V), Store merchandising (M),
Interaction & flows (F), Game-page anatomy (P). Every item uses only real
catalog data — no fabricated scores, prices, or counts.

## M — Store merchandising

1. **M1 — "New releases" shelf from real release dates.** The lead shelf was
   the alphabetical catalog head (a permanent A–L window); Steam leads with
   recency. New first shelf sorted by newest `recentReleases.publishedAt`;
   "Released & playable" now orders by latest activity.
2. **M2 — Capsule information scent.** Capsule footers repeated the shelf
   header ("RELEASED" nine times); now they carry platform · year ·
   implementation count.
3. **M3 — Platform chips in Browse all.** No way to answer "show me the N64
   projects" despite 100% platform coverage; add top-platform toggle chips
   backed by a `platform` tracking filter.
4. **M4 — "More like this" on game pages.** Pages dead-ended; series like
   Jak 1/2/3 were unlinked. Score by shared franchise word, platform, and
   era; show 4 related capsules.
5. **M5 — Hero identity + description.** The featured panel had ~150px of
   dead space; now year · platforms · implementation count and a clamped
   description sell the click.

## V — Visual parity

6. **V1 — Hero thumbs as a 2×2 grid** filling the info column midsection,
   CTA anchored at the bottom (Steam's featured-capsule anatomy).
7. **V2 — Landscape covers hug their own ratio** on the game page instead of
   floating in a 2:3 slot between filler bands.
8. **V3 — Browse rows lead with landscape capsules** (69×26, Steam's list
   cue) instead of 28px squares.
9. **V4 — Storefront rhythm**: 40px between shelves, 14px section titles
   with 12px clearance.
10. **V5 — Section headers sit on Steam's fading hairline rule.**

## F — Interaction & flows

11. **F1 — In-memory back/forward navigation stack** with header chevrons
    and mouse buttons 4/5, spanning tabs and game pages.
12. **F2 — Wire "View in Library"** on completed downloads (the button
    existed but App never passed the handler — unreachable code).
13. **F3 — Store tab always goes home**: clicking Store from a game page
    closes it and lands at the top, Steam-style.
14. **F4 — Browse query/filters survive** tab switches and game-page
    round-trips (scroll was restored against a filter state that had
    evaporated).
15. **F5 — Hero thumbs preview on hover/focus**, click stays for touch.

## P — Game page anatomy

16. **P1 — Implementations directly under the gallery** (the "buy area"
    before long-form content; update feed after it, like Steam Events).
17. **P2 — Honest cover slot** (delivered with V2).
18. **P3 — Glance rail**: clamped description + tag chips in the right
    column above the fold; the main-column Tags section retires.
19. **P4 — Breadcrumb trail** ("Store › platform › game") instead of a bare
    back link.
20. **P5 — Single-source metadata**: one availability badge, no
    title-echoing subtitle, no "Unknown"/"None listed" placeholder rows.

## Status

All 20 implemented 2026-08-15 (P2 via V2). Verification: vitest suite +
before/after screenshots.
