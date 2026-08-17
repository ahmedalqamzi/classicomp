• # Classicomp — STORE screen spec

  **Context:** STORE is the default tab after LIBRARY. Same chrome as app: `#171a21` bg, `#1b2838` panels, `#66c0f4` interactive accent, `#75a319` success/ownership accent, 11–13px dense type, bottom downloads bar persists on this screen.

  ## Layout hierarchy (top → bottom)

  1. **Toolbar row (one line, 32px tall, `#1b2838`):** search box (left, ~220px, placeholder "Search store…") · status dropdown (`All statuses` default; options: Released / Playable / In development / Source only / Inactive) · `Watched only` chip (toggle, `#66c0f4` when active) · right-aligned: result count (`87 of 110 games`).
  2. **Scan status line (single 11px row, below toolbar):** left: `Last scan: 2h ago · 110 games · 143 implementations tracked`; right: `Check for updates` text button (`#66c0f4`). While scanning: spinner + `Scanning GitHub/GitLab… (34/143)`; button disabled. On failure: `#c15755`-tinted text `3 sources unreachable — showing cached data from {timestamp}` with `Retry` inline. This line is the *only* place scan state lives; never a modal/toast.
  3. **Grouped list (scrolls between toolbar and downloads bar):** game group header rows, each with 1+ implementation rows beneath.

  ## Group header (game row, 36px, `#1e2a3a`)

  - Col 1: 48×22 capsule/box-art thumb (or genre glyph placeholder).
  - Col 2: Game title (13px, primary, white) + one-line subtitle: `1997 · Engine reimplementation for {platform}` (11px, `#8f98a0`, secondary).
  - Col 3 (right): aggregate state chip — best available across implementations: `Released` `#75a319` / `Playable` `#a4cf38`-adjacent / `In development` `#66c0f4` / `Source only` `#8f98a0` / `Inactive` `#5a6a7a` — plus implementation count (`3 implementations`, 11px).
  - Chevron: groups with >1 implementation start expanded on first visit, collapse state remembered.

  ## Implementation row (28px, indented 16px under header, `#171a21`)

  Columns left→right:
  1. **Name** (12px, primary): project display name, e.g. `OpenRCT2` — clicking opens its repo page externally.
  2. **Type tag** (11px, bordered, `#66c0f4` text): `Decompilation` / `Recompilation` / `Source port`.
  3. **Status** (11px, colored per chip palette above).
  4. **Latest release** (11px, `#8f98a0`, secondary): `v0.4.21 · 3d ago` or `no releases`.
  5. **Watch** (star icon button, 16px): outline = not watching; filled `#66c0f4` = watching. Watching is per-game (any star on an implementation toggles the parent game).
  6. **Action button (right-most, 96px fixed width) — see semantics below.**

  ## Button / ownership semantics

  - **Not owned, has release:** solid `#66c0f4`-text bordered button `Download`. Click → resolves project's latest GitHub/GitLab release asset, enqueues in bottom downloads bar, game enters LIBRARY.
  - **In library:** filled `#75a319` button `In Library ✓`, click → switches to LIBRARY tab focused on that game. Never re-offer Download for an owned game; secondary small `Update` link appears beside it only when a newer release exists than the installed one.
  - **Source-only (no releases):** button replaced by static 11px label `Source only`, plus a text link `View source` (opens repo). No download affordance, no disabled button — absence communicates it.
  - Ownership is determined by "did a download from this store complete," not by files on disk; state badge must survive app restart.

  ## Filters & edge states

  - Search matches game title and implementation names; dropdown filters on implementation status (a group shows if any implementation matches); `Watched only` intersects both.
  - **No results:** centered in list area, 12px `#8f98a0`: `No games match these filters.` + `Clear filters` text button.
  - **Unreachable sources:** list still renders from cache; only the scan line shows the warning (see above). Rows for unreachable projects keep last-known release info; never hide them.
  - **Zero games watched + chip active:** `You're not watching any games yet — star a game to follow its releases.`
  - **First launch, no cache:** list area shows `Fetching project index…` skeleton; scan line reads `First scan in progress`.
  - Bottom downloads bar unchanged: active queue, completed entries link to the library entry they created.

