# Classicomp — four-AI review: the 20 recommendations

Compiled 2026-08-15 from four independent reviews of the running app: Kimi (UI/UX vs the Steam client, 8 findings), Grok (accessibility + UX quality with measured evidence, 6), Codex (runtime-defect code review, 6), Claude (product-level Steam comparison + consolidation). Ranked by impact; source lane in brackets.

## Trust & correctness — where the app lies to the user

1. **Stop marking downloads as "installed".** The browser-fallback download path flags a game installed without knowing the file finished; the library then shows a green PLAY beside "Install path: Not installed" — three surfaces contradicting each other. Split the vocabulary: *Downloaded* ≠ *Installed*; PLAY renders only when something can actually launch, otherwise an honest "Set up" state. [Codex + Grok + Kimi, unanimous]
2. **The game page buries its primary action.** The one place a user decides — the app page — has no download/install box above the fold; Download sits at the bottom of Implementations. Steam's purchase box is the anchor of the page. Add a CTA block at the top of the right rail (chosen asset name + size + Download). [Kimi]
3. **Downloads bar states conflict and never resolve.** "Waiting for a verified install recipe" shows *during* an active download; completed entries keep a full progress bar forever; the expanded row duplicates the collapsed strip. One state source, speed/ETA while active, auto-collapse on completion, "View in Library" after. [Kimi]
4. **Large downloads buffer entirely in memory** before saving — a 1GB asset means a 1GB Blob. Stream-to-save only under a size threshold; hand bigger files to the browser's download manager directly. [Codex]
5. **Profile switching races in-flight downloads** — whole-state bridge responses from one profile can land after switching to another. Guard async bridge results with a profile epoch. [Codex]

## Steam-parity UX

6. **The storefront hero wastes its space** — a blurry wash with small centered box art vs Steam's full-bleed key art, left-aligned title/CTA, and screenshot thumbnails. Crop with a gradient scrim and restructure. [Kimi]
7. **Browse rows are cards, not a table** — ~100px tall with dead whitespace and "Catalogued; verification queued" repeated as noise on dozens of rows. Tighten to ~32px table rows, collapse repeated placeholders to an em-dash. [Kimi]
8. **Capsules have no hover affordance** — identical at rest and under the cursor. Steam capsules lift, brighten, and glow (this was specced in an earlier round but didn't survive the rewrites). [Kimi]
9. **Navigation dead-ends**: no back/forward, the Store tab resets all state, store→game→back loses the scroll position, Friends ignores Escape. Add a small nav stack in the header, Esc/backdrop closes everywhere, scroll restoration. [Kimi + Codex]
10. **Every search keystroke re-renders the entire storefront** with an O(projects × library) pass inside. Debounce the query and memo-split the browse list from the shelves. [Codex]
11. **No persistent header search.** Steam's search is always visible with a suggest dropdown (capsule thumbnails inline); ours hides below the featured hero. [Claude]
12. **The wishlist is only a filter chip.** Give it a real view, and surface *release notifications* — the scans already detect when a wishlisted game publishes a new version; a badge on the header is the natural Steam-style payoff. [Claude]
13. **Mods live in the wrong place** — a global tab, where Steam puts Workshop on each game's page. Add a per-game mods section/link on game pages; keep the tab as the browser. [Claude]

## Accessibility (all with measured evidence)

14. **Overlays are not real dialogs**: no focus trap, no focus return, uneven Escape handling; menus/dialogs claim aria semantics without their interaction contracts. Implement the full dialog/menu patterns. [Grok + Codex]
15. **The `--dim` text token (#65717b) fails WCAG AA on every surface it paints** (measured down to 2.99:1 on asset captions). Lighten to ≥4.5:1 against its darkest backgrounds. [Grok]
16. **Async changes are silent to assistive tech** — scan completions and download progress have no aria-live announcements (only scan *errors* do). [Grok]
17. **The storefront is 418 tab stops with no skip link.** Add skip-to-content and roving tabindex within shelves/browse so keyboard users aren't stranded. [Grok]
18. **56 external "release page" actions are `<button>`s** calling window.open — middle-click, copy-link, and screen-reader link semantics all broken. Render them as real `<a>` links. [Grok]
19. **Asset filenames are illegible**: truncated at every width *and* failing contrast, and the asset menu is mouse-only (ArrowDown never moves focus in). Full name in the accessible label, wrapping caption, keyboard-enabled menu. [Grok]
20. **Library detail contradicts itself and repeats itself**: "Never played" appears twice with different labels, the hero stretches a gameplay screenshot where Steam uses key art with a logo, and the Properties dialog duplicates the Game Information panel verbatim. Unify the vocabulary and differentiate the surfaces. [Kimi]

## The reviewers' shared verdict

Kimi, closing its report: "the bones are right — palette, density ambition, surface set… What breaks the illusion is sequencing (CTA buried), feedback (no hover, conflicting download states), and honesty (blur-fill media, contradictory install state)." Items 1–5 restore honesty, 6–13 restore Steam's feel, 14–19 make it usable by everyone, 20 tidies the seams.

## Status — 2026-08-15 evening pass

Done: 1 (Downloaded ≠ Installed vocabulary), 2 (CTA box, now with source-zip
fallback), 3 (downloads bar states + View in Library), 4 (200MB stream limit,
browser hand-off above it), 5 (profile epoch guards), 6 (hero crop + scrim),
7 (browse table rows), 8 (capsule hover lift), 10 (debounced search),
11 (persistent header search with capsule suggestions), 12 (wishlist shelf +
release notices), 13 (per-game mods section), 14 (modal/menu focus
contracts), 15 (--dim lightened to #86909b), 16 (aria-live on scans and
downloads), 17 (skip link), 18 (real links for release pages), 19 (keyboard
asset menu).

Remaining: 9 partial (Esc + scroll restoration done; no back/forward nav
stack), 20 unverified (needs a populated library to reproduce the duplicate
panels).
