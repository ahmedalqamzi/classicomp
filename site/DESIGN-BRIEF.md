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
  row, `<ul>` for feature and roadmap lists, `<figure>` for the client
  captures.
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
pill), then a hero that shows the product. The hero is single-column: copy
first, then the app-window chrome (Catalogue/Library/Downloads tabs, search
field, mono status line with the real sync numbers) framing a real capture of
the client's store shelf, then a mono strip naming games from the catalogue.
The fold ends on the shelf and the names — the catalogue is the product, so
it is the first thing you see. Sections below read like store furniture:
eyebrow labels, a metadata strip for the stats, a framed game-page capture
ahead of dense hoverable feature rows, a numbered card grid for the roadmap,
and a bordered notice panel for the legal block.

**Real captures, not mockups (second pass).** `media/shelf.jpg` (1800×302)
and `media/game-page.jpg` (1500×788) are genuine captures of the app, cropped
to exclude account names, profiles and paths. Do not replace them with
invented mockups and do not re-crop them in a way that reintroduces window
chrome. Both ship with `width`/`height` attributes (no layout shift) and
meaningful alt text; the hero shelf loads eager with `fetchpriority="high"`,
the game page below the fold uses `loading="lazy"`. Below 700px the shelf
holds a 150px height and crops the row horizontally (`object-fit: cover`,
left-anchored) so box art stays legible instead of shrinking to a ribbon.

**Naming the catalogue.** The hero ends on a mono strip — an accent
"IN THE CATALOGUE" label followed by twenty real, shipped titles (Diablo,
Ocarina of Time, Super Mario 64, Morrowind, Symphony of the Night, …). The
shelf capture names eight more visually. A visitor should know within seconds
whether something they care about is in there. Only name games confirmed to
be in the catalogue.

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
badges, the status line, the catalogue name strip. The mono-is-data rule is
deliberate: numbers and labels should feel like client UI, not prose.

**Signature — the window chrome.** The CSS-only dithered capsule art survives
only as feature-row thumbs; the hero and the "How it works" figure now frame
the real captures with the same chrome (dots, tab strip, status line). The
roadmap is a numbered card grid — mono indices `01–07`, same bordered-panel
furniture as the features — and since seven cards never fill an auto-fit
grid evenly, the last card spans its row. The only motion left is the window
entrance, the status cursor blink and hover lifts;
`prefers-reduced-motion` kills all of it.

**Deliberately left out.**

- *Webfonts* — self-contained means no CDN, and base64-embedding a condensed
  face wasn't worth the weight when the local stacks cover most desktops.
- *Carousel/parallax/scroll reveals* — a storefront is dense and still;
  motion beyond the entrance and hovers would fight the direction.
- *A JavaScript bundle* — the only JS is the theme toggle (progressive
  enhancement; the page is fully themed without it).

## Constraints

- Static only — this is GitHub Pages. No build step, no framework.
- Self-contained: no CDN fonts or scripts; images are local files in
  `media/`.
- Keep it readable at 320px wide and at 2560px. (Verified at 320 / 768 /
  1440 / 2560 in both themes, headless Chromium screenshots, fold and full
  page.)
