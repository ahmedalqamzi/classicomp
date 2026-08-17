# Design brief — Classicomp site

The visual design is done. This file records what was chosen and why, so
future passes can build on the decisions instead of re-deriving them.

## What it is

Classicomp is a desktop storefront for open-source recompilations and source
ports — projects that rebuild classic games to run natively on modern
machines. It finds them, installs them and launches them. It ships no game
content; every game needs the player's own original copy.

## Direction

Steam-like. Dark, dense, product-first — a storefront, not a marketing splash.
Reference points are the Steam client and store pages rather than a typical
open-source project page.

## What is already in place

- All copy is written and factual. Numbers come from a real test pass
  (151 projects tracked, 55 playable games, 48 builds offered, 42 launching).
  Please don't invent new figures.
- Structure is semantic: `header`, `section` per block, `<dl>` for the stat
  row, `<ul>` for feature lists.
- Every colour, font and spacing value is a CSS custom property at the top of
  `styles.css`. Redefining those tokens restyles the whole page.
- Light and dark both resolve: the unstamped default follows
  `prefers-color-scheme`, and an explicit `data-theme="light|dark"` on
  `<html>` wins in either direction. The topbar toggle writes that attribute
  and persists the choice to localStorage; a saved choice is applied before
  first paint by an inline script in `<head>`.

## Design record

**Layout concept — "the client, not the splash."** The page is structured
like the Steam client itself: a sticky topbar (wordmark, section nav, install
pill), then a hero whose right half is a CSS-only mock of the Classicomp
window — Catalogue/Library/Downloads tabs, a search field, a featured capsule
with a `+ Install` chip, a four-tile shelf, and a mono status line with the
real sync numbers. The page shows the product instead of describing it.
Sections below read like store furniture: eyebrow labels, a metadata strip
for the stats, dense hoverable rows for features, a wishlist-style roadmap,
and a bordered notice panel for the legal block.

**Palette — client slate with Steam's two-accent system.** Dark: `#10161d`
bg, `#18212b`/`#1f2a37` surfaces, `#d6e0ea` ink, `#8f98a0` muted, client-blue
`#66c0f4` for links/active states and install-green `#a4d007 → #5c7e10` for
every "get it" action. Steam has no light theme, so the light palette is an
invention in the same hue family: `#d4dbe3` bg, near-white `#f4f7fa`
surfaces, `#22303e` ink, darkened accents (`#175e8f`, `#6d9509 → #45600b`)
for contrast. Capsule art stays saturated in both themes.

**Type pairing.** No webfonts (self-contained constraint), so the storefront
voice comes from stack choices: a condensed gothic display stack
(`Bahnschrift → Roboto Condensed → Franklin Gothic → Arial Narrow`) used
uppercase with wide tracking for the wordmark, headings, tabs and eyebrows;
the system sans for body; a real monospace for all data — stats, labels,
badges, the status line. The mono-is-data rule is deliberate: numbers and
labels should feel like client UI, not prose.

**Signature — dithered capsule art.** Every capsule and feature thumb is
pure CSS: a saturated diagonal gradient under a `repeating-linear-gradient`
scanline layer and a vignette, so tiles read as CRT-flavoured box art with no
images and no invented game names. Tiles are labelled only with vocabulary
the copy already uses (recompilation, decompilation, source port). The one
ambient motion is a slow sheen across the featured capsule; everything else
is a hover lift at most. `prefers-reduced-motion` kills all of it.

**Deliberately left out.**

- *Real screenshots* — none exist in the repo yet; the CSS app window is the
  stand-in. When real shots land, the window chrome is designed to frame one.
- *Webfonts* — self-contained means no CDN, and base64-embedding a condensed
  face wasn't worth the weight when the local stacks cover most desktops.
- *Carousel/parallax/scroll reveals* — a storefront is dense and still;
  motion beyond the sheen and hovers would fight the direction.
- *A JavaScript bundle* — the only JS is the theme toggle (progressive
  enhancement; the page is fully themed without it).

## Constraints

- Static only — this is GitHub Pages. No build step, no framework.
- Self-contained: no CDN fonts or scripts.
- Keep it readable at 320px wide and at 2560px. (Verified at 320 / 375 /
  1440 / 2560 in both themes, headless Chromium screenshots.)
