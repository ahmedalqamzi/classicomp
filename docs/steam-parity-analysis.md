# Classicomp vs Steam — four-AI analysis (40 recommendations)

Compiled 2026-08-14 from four independent analyses: Kimi (visual teardown of the
running app vs the Steam client), Grok (audit of all 101 pulled covers and 62
screenshots), Codex (media-pipeline architecture review), Claude (orchestration
+ pipeline analysis). ✅ = already implemented during compilation.

## Kimi — visual teardown (what Steam does vs what we do)

1. **Portrait 2:3 shelf tiles (~150×225), `object-fit: cover`** — Steam's library grid is 600×900 portrait; our 16:9 tiles force blur wings on every cover. The single highest-impact change.
2. **Kill `contain` + blur letterboxing everywhere** — Steam never letterboxes; crop with `object-fit: cover` and `object-position`, use gradient scrims on heroes; blur only as a page-background wash.
3. **Game page right rail should open with the full-width portrait cover**, Steam-style, before the metadata rows.
4. **Hero banners: crop + scrim, don't blur-fill** — the current 280px blur banner reads as filler; Steam heroes are cropped art with a dark gradient into the page.
5. **Gallery main preview: cover-crop at 16:9** with thumbs below, like Steam's screenshot strip.
6. **Browse-list thumbs: crop, don't fit** — at 43px tall use `object-fit: cover` (or 48×48 square icons like Steam's list view); "blur with a stripe of cover" is unreadable.
7. **Right rail density**: ~11–12px rows, 6–8px gaps, bordered metadata card, status block where Steam puts review score; repositories belong in the Implementations section, not metadata.
8. **Title above the media** — Steam app pages lead with the title; ours leads with blur. Hoist the h2 + subtitle above the content grid, drop the enclosing card chrome.
9. **Hover lift on capsules** — `translateY(-2px) scale(1.03)` + soft shadow, 120ms; Steam capsules read as doors, ours as outlines.
10. **Row density in browse**: collapse repeated "No releases yet" cells to an em-dash, tighten padding, fixed-width right-aligned meta columns so rows scan as a table.

## Grok — media audit (what the data honestly is)

1. **Only 54 of 101 pulled covers are true portrait box art** — enforce an aspect gate (w/h ≤ 1.05) on every cover. ✅
2. **Prefer 0.60–0.80 aspect when choosing between candidates** — Steam capsules are 0.667.
3. **Junk-name matching must treat `_`/`-` as separators** — `deck_gyro_1.jpg` evaded a word-boundary regex; use substring matching. ✅
4. **Cover junk terms**: screenshot, gameplay, logo, icon, menu, gui, wallpaper, settings; also reject `.svg` and Commons SVG thumbs; prefer `originalimage` over `thumbnail`. ✅
5. **Screenshot junk terms**: settings, controller, config, menu, diagram, chart, install, build, objdiff, launcher, gyro, extract, propert-, banner, title-, dolphin, plus `#gh-light/dark-mode` fragments. ✅
6. **Landscape box scans are real boxes** (N64/SNES) — accept them only when named as boxes; they can blur-fill a portrait tile honestly. ✅
7. **Dual-SKU pages (Pokémon) use composite lead images** — the puller must pick a single box, not the article lead, or the aspect gate keeps failing them.
8. **Opaque `user-attachments` UUID images are unprovable by filename** — they need a human pass or an image classifier before being trusted as gameplay.
9. **Wikipedia covers are ~250–380px scans, not authored capsules** — fine for tiles, never upscale into heroes.
10. **Per-slot honesty**: portrait capsule = portrait box art only; store-header key art cannot be faked from box photos (use branded gradient); screenshots slot = provable gameplay only.

## Codex — pipeline architecture (why bad art was permanent)

1. **A non-null cover is effectively permanent** — lookups gate on `coverUrl === null`; nothing re-evaluates. ✅ (re-check when aspect missing; tri-state replace/clear)
2. **Provider images are mislabeled as covers** with no identity or image validation. ✅ (RAWG background demoted to key art; Wikipedia validated)
3. **The domain model discards every fact needed for self-correction** — no aspect, provenance, or validation state stored. ✅ (coverAspect added)
4. **UI selection is "first non-null", not "best validated asset"** — rank candidates by validation, not order.
5. **README screenshot admission checks only filenames and a badge blacklist** — no notion of gameplay; needs the extended filter now, a classifier later. ✅ (filter)
6. **Screenshots have a successful-empty one-way ratchet** — an emptied README can never clear stored shots; make results tri-state (unavailable/clear/replace).
7. **Topics and releases share the same ratchet** — same tri-state contract needed there.
8. **Baked media has no validation gate or correction rollout path** — validate at catalog build; version assets so corrections supersede stored ones. ✅ (build-time validation + aspect-keyed re-check)
9. **Browser and Tauri recovery behavior is not equivalent** — same persisted data can heal differently; needs one shared normalization spec + parity fixtures.
10. **Full automation needs an app-owned media service** — with provider credentials server-side, periodic revalidation, and asset revisions; the client-only pipeline is a first-fill cache by nature.

## Claude — orchestration and pipeline (the plan that ties it together)

1. Portrait 2:3 tiles as the primary capsule shape (with Kimi #1). 
2. Store cover aspect metadata with every cover. ✅
3. Validate covers at lookup time (portrait gate + name rules). ✅
4. Self-correcting covers: re-lookup on invalid/unvalidated, tri-state replace/clear. ✅
5. Two art kinds routed to the right slots: cover (portrait box) vs key art (landscape OG/RAWG). ✅ (data side)
6. Gameplay filename filtering for README extraction. ✅
7. Wikipedia article media-list as a keyless gameplay-screenshot source (next).
8. One-time cleanup migration nulling audit-flagged covers so the validated pipeline refills. ✅ (browser; Rust in flight)
9. A deliberate "no cover" tile design — branded title gradient, like Steam's generated capsules.
10. Remember failed lookups so permanently coverless games aren't re-queried every pass.

## Verdict

Codex's summary stands for all four: the pipeline was "an automatic first-fill
cache, not a self-correcting media system," rendered into tiles shaped for the
wrong aspect. The fix wave: validated self-correcting media (done), portrait
capsules + Steam page skeleton (Kimi), Rust parity (Codex), refilled covers
under the strict rule (Grok).
