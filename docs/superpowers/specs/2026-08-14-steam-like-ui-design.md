# Steam-like UI: Catalog Filters, Mods Tab, Sign In/Out, Bottom Downloads Bar

Date: 2026-08-14
Status: Approved design, pending implementation plan

## Context

Classicomp is a Tauri + React launcher for open-source classic game engines. Today it has
Library / Catalog / Downloads header tabs, a profile `<select>` switcher, and a 24px status
strip. The user wants a more Steam-like shell:

1. Filters on the catalog (there are none today).
2. Real sign in / sign out affordances (today: only a profile dropdown).
3. A **Mods** tab (per-game mod manager).
4. Downloads moved out of the header tabs into a bottom bar (Steam-style).

Approved decisions from brainstorming:

- Mods tab = per-game mod manager with enable/disable toggles (seeded mock data).
- Sign in/out = Steam-style account menu with Sign out → sign-in screen (simulated auth over
  the existing local profiles; no real credentials).
- Downloads = bottom bar only, removed from header tabs; chevron expands a queue panel docked
  above the bar; panel auto-opens when an install is queued.
- Catalog filters = search box + genre tag chips + install-state filter + runtime filter.
- Approach = full TS/Rust parity, and split `App.tsx` (426 lines, would grow to ~800) into
  `src/ui/` view modules.

## Domain model changes

Mirrored in TypeScript (`src/domain/types.ts`, `src/domain/state.ts`) and Rust
(`src-tauri/src/database.rs`, `src-tauri/src/lib.rs`).

### Routes

```ts
export type AppRoute = 'library' | 'catalog' | 'mods'; // 'downloads' removed
```

- `install/queue` no longer changes `route`; it only updates library/download state.
- Rust `load_state` sanitizes a stale persisted route (e.g. legacy `"downloads"` in an
  existing SQLite DB) to `"library"`.

### Game tags

`Game` gains `tags: string[]`.

Seed tags (TS `seed.ts` and Rust `seed_games()` must match):

| Game | Tags |
| --- | --- |
| openrct2 | Simulation, Strategy |
| devilutionx | RPG, Action |
| openmw | RPG, Open World |
| openttd | Simulation, Strategy |
| scummvm | Adventure, Point & Click |
| soh | Adventure, Action |
| zelda64recompiled | Adventure, Action |

Rust storage: new table `game_tags (game_id text references games(id) on delete cascade, tag
text, primary key (game_id, tag))`; `games()` loads tags per game ordered by tag.

### Mods

```ts
export interface Mod {
  id: string;
  gameId: string;
  name: string;
  summary: string;
  version: string;
  author: string;
  enabled: boolean;
}
```

`AppState.mods: Record<string, Mod[]>` keyed by profileId, mirroring the existing `libraries`
pattern. New selector `selectVisibleMods(state): Mod[]` returns the active profile's mods
(`[]` when signed out).

Seed mod catalog (same in TS and Rust):

| id | gameId | name | version | author | summary |
| --- | --- | --- | --- | --- | --- |
| mod-openmw-tamriel-rebuilt | openmw | Tamriel Rebuilt | 24.12 | Tamriel Rebuilt Team | Adds the Morrowind mainland with new regions and quests. |
| mod-openmw-rebirth | openmw | Morrowind Rebirth | 7.0 | trancemaster_198 | Overhaul of landscapes, cities, and balance. |
| mod-openrct2-openmusic | openrct2 | OpenMusic | 1.2 | OpenRCT2 Community | Open-source ride and scenery music pack. |
| mod-openrct2-scenarios | openrct2 | Classic Scenarios Pack | 2025.1 | OpenRCT2 Community | Recreates the original RCT1 scenario lineup. |
| mod-devilutionx-infernal | devilutionx | Infernal Difficulty | 0.9 | Community | Brutal difficulty rebalance for veteran players. |
| mod-soh-hd-textures | soh | HD Texture Pack | 3.1 | Community | High-resolution texture replacements. |

Rust storage: `mods (id text primary key, game_id text references games(id) on delete cascade,
name text not null, summary text not null, version text not null, author text not null)` and
`profile_mods (profile_id text references profiles(id) on delete cascade, mod_id text
references mods(id) on delete cascade, enabled integer not null default 0, primary key
(profile_id, mod_id))`. Per-profile mod lists are built as `mods LEFT JOIN profile_mods` with
`coalesce(enabled, 0)`. Both seeds (TS and Rust) enable exactly one demo mod for the owner
profile: mod-openmw-tamriel-rebuilt; everything else starts disabled.

### Sign in / out

- TS: `AppState.activeProfileId: string | null`; `null` = signed out.
- Rust: `AppState.active_profile_id: Option<String>`; `load_state` no longer defaults a missing
  setting to `"owner"` — a missing/`NULL` setting yields `None`. Fresh installs still seed the
  setting to `"owner"`, so first run stays signed in (unchanged behavior).
- `load_state` with `None` returns empty `downloads`/`save_snapshots`; `libraries` and `mods`
  maps are returned in full as today.
- All existing selectors must tolerate `null` (`selectVisibleLibrary`, `selectVisibleMods`,
  and the downloads filter in `App.tsx` all yield empty results).

### Actions and bridge

TS actions:

```ts
export type AppAction =
  | { type: 'profile/activate'; profileId: string }   // unchanged; doubles as sign-in
  | { type: 'profile/signOut' }                        // new: { ...state, activeProfileId: null }
  | { type: 'mod/toggle'; modId: string }              // new: flips enabled for active profile
  | { type: 'route/change'; route: AppRoute }
  | { type: 'game/select'; gameId: string }
  | { type: 'install/queue'; gameId: string };         // modified: no route change
```

`mod/toggle` is a no-op when signed out or when the mod id is unknown.

Bridge interface (`src/platform/bridge.ts`):

```ts
export interface PlatformBridge {
  loadState(): Promise<AppState>;
  setActiveProfile(profileId: string): Promise<AppState>;
  signOut(): Promise<AppState>;              // new
  queueInstall(gameId: string): Promise<AppState>;
  toggleMod(modId: string): Promise<AppState>; // new
}
```

Rust commands (`src-tauri/src/lib.rs`, registered in `generate_handler!`):

- `sign_out()` → sets `active_profile_id` setting to `NULL`, returns state.
- `toggle_mod(mod_id)` → upserts `profile_mods` flipping `enabled` for the active profile;
  errors with `"not signed in"` when there is no active profile.
- `queue_install` drops its `upsert_setting("route", Some("downloads"))` line.

## Frontend structure

`App.tsx` (stays at `src/App.tsx`) remains the composition root: state loading, bridge calls,
route switching, and an ephemeral `downloadsOpen` useState (set to `true` when `queueInstall`
resolves). When `activeProfileId` is `null` (or matches no profile) it renders only
`<SignInView>`; otherwise the normal shell.

New/extracted modules under `src/ui/`:

| File | Contents |
| --- | --- |
| `app-header.tsx` | Brand, uppercase Steam-style nav tabs (Library / Catalog / Mods — no Downloads), `AccountMenu` |
| `sign-in-view.tsx` | Full-screen centered sign-in card: "Sign in to Classicomp", profiles as account tiles (initials + name), click to sign in |
| `library-view.tsx` | `LibrarySidebar`, `GameDetail`, `LibraryStateIcon` (moved unchanged) |
| `catalog-view.tsx` | `CatalogView` + filter bar; filter state is local `useState` |
| `mods-view.tsx` | Mods grouped per game: game header (icon, title), rows with name/summary/version/author and an enable toggle |
| `downloads-bar.tsx` | Bottom downloads bar + expandable queue panel |
| `game-icon.tsx` | Shared `GameIcon` |

### Account menu

Button with avatar initials + display name + chevron. Dropdown (`role="menu"`, anchored right,
Steam-dark surface): "Switch account" section listing the other profiles, separator, "Sign
out". Closes on Escape and on outside click. Switching a profile keeps today's
`setActiveProfile` behavior (first library game gets selected).

### Catalog filter bar

Above the catalog table:

- Search input — case-insensitive substring over `title` + `summary`.
- Tag chips — pill toggles built from the distinct tags in the catalog; multi-select narrows
  with AND semantics (game must carry every selected tag).
- Install state select — All / Installed / Not installed (anything that isn't `installed`,
  including `queued`, counts as not installed).
- Runtime select — All + distinct runtimes present in the catalog. With today's catalog this
  has a single value ("Native Linux"); it is data-driven and becomes useful automatically when
  a non-native runtime exists. Accepted limitation — no fake runtimes will be seeded.

Filtering logic lives in `src/domain/catalog.ts` as pure functions:

```ts
export interface CatalogFilters {
  query: string;
  tags: string[];
  installState: 'all' | 'installed' | 'not-installed';
  runtime: 'all' | string;
}
export function filterCatalog(games: Game[], library: LibraryEntry[], filters: CatalogFilters): Game[];
export function collectTags(games: Game[]): string[];     // distinct, sorted
export function collectRuntimes(games: Game[]): string[]; // distinct, sorted
```

An empty result renders the existing empty-state styling with "No games match these filters."

### Mods view

One scrollable column; a section per game that has mods (games without mods are omitted).
Section header: game icon + title. Rows: mod name, summary, version, author, and a toggle
switch (`role="switch"`, `aria-checked`) bound to `enabled`, calling `bridge.toggleMod`.

### Downloads bar

Replaces `StatusStrip` as the bottom row of the shell grid.

- Collapsed: "Downloads" label + count badge, the first queued item's title with a blue
  progress bar and state text, and a chevron "View queue" button. Empty: "No active downloads"
  and no expand affordance. Keeps `role="status"`.
- Expanded: panel docked directly above the bar listing every queued download for the active
  profile (icon, title, state, progress bar). Closed via the chevron or by clicking the bar.
- The panel opens automatically when the user queues an install (from catalog or game detail).

## Persistence

- Browser bridge: `STORAGE_KEY` bumps from `classicomp.app-state.v1` to
  `classicomp.app-state.v2`; the old key is ignored (dev localStorage resets to fresh seed; no
  migration code). `readState` keeps its parse-failure fallback to seed and additionally maps
  an unknown persisted `route` to `'library'`.
- SQLite: additive only — `create table if not exists` for `mods`, `profile_mods`,
  `game_tags`; each is populated from seed data when empty, so existing dev databases pick up
  the new rows without a migration framework.

## Styling

- Reuse the existing Steam palette in `tokens.css`; new CSS goes in `app.css` (and
  `responsive.css` only if the current breakpoints require it — check during implementation).
- Header tabs: uppercase, letter-spaced, Steam-like. Active tab keeps the current
  `surface-3` treatment.
- New components: account dropdown, sign-in card (centered, subtle gradient like Steam's
  login), filter bar with pill chips (selected = `--blue` fill), mods sections with toggle
  switches, downloads bar (`#10141b`) with `--blue` progress bars.

## Testing

- `src/domain/state.test.ts` — update `install/queue` expectations (route unchanged); add:
  `profile/signOut` nulls the active profile; `profile/activate` works after sign-out;
  `mod/toggle` flips only the active profile's mod and is a no-op when signed out.
- `src/domain/catalog.test.ts` (new) — `filterCatalog`: search match, tag AND-narrowing,
  install-state, runtime, combined filters, empty result; `collectTags`/`collectRuntimes`.
- `src/App.test.tsx` — update nav expectations (Library/Catalog/Mods tabs, no Downloads tab);
  queueing from the catalog stays on the catalog and opens the downloads panel with the item;
  sign out → sign-in screen → sign in as Guest shows the guest library.
- `src/data/seed.test.ts` — update for the new `tags`/`mods` shape (read it first; keep its
  existing intent).
- `src-tauri/tests/database.rs` — update for `Option<String>` active profile, tags loading,
  `sign_out`, `toggle_mod`, and `queue_install` no longer persisting a route.
- Verify with `npm run test:all` (vitest + tsc build + cargo test).

## Edge cases

- Sign out while downloads are queued: downloads are per-profile; the sign-in screen hides the
  shell; signing back in restores them.
- Legacy persisted route `downloads` (SQLite) or a hand-edited storage value → `library`.
- Queued games appear under "Not installed" in the catalog install-state filter.
- Unknown mod id or signed-out `mod/toggle` → state unchanged (TS) / `"not signed in"` error
  (Rust command).

## Out of scope

- Real authentication or credentials (simulated over local profiles).
- Real mod downloads, load ordering, or Workshop integration.
- Changing game artwork, adding games, or altering library/detail views beyond the move.
