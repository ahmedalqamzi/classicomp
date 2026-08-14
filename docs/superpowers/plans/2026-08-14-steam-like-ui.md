# Steam-like UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Classicomp feel like Steam: catalog filters, a Mods tab, simulated sign in/out with an account menu, and downloads moved into a bottom bar.

**Architecture:** Domain changes (routes, tags, mods, nullable active profile) are mirrored in TypeScript (`src/domain`) and Rust (`src-tauri/src`). React views are extracted from `App.tsx` into `src/ui/` modules; catalog filtering is a pure function in `src/domain/catalog.ts`. Persistence stays browser-localStorage + Tauri SQLite, both upgraded without migration frameworks.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tauri 2, rusqlite. Spec: `docs/superpowers/specs/2026-08-14-steam-like-ui-design.md`.

## Global Constraints

- No new runtime dependencies. Only `react`, `react-dom`, `lucide-react`, `@tauri-apps/api` are allowed; they are already installed.
- The lucide-react version pinned in `package.json` exports `ChevronDown`, `ChevronUp`, `LogOut`. If a named icon import fails at build time, pick the closest equivalent from `node_modules/lucide-react/dist/esm/icons/` and use it consistently.
- TS seed data (`src/data/seed.ts`) and Rust seed data (`src-tauri/src/database.rs`) must describe the same games, tags, and mods.
- Browser storage key becomes exactly `classicomp.app-state.v2`.
- Follow existing code style: 2-space indent, single quotes, function components, no default exports in `src/`.
- Test commands: `npx vitest run <files>` per task; final gate `npm run test:all` (vitest + tsc build + cargo test) and `npm run test:rust`.
- Rust tests run with `--no-default-features`, so only `database.rs` is compile-checked there; `lib.rs` command wrappers are verified with `cargo check --features desktop`.
- Do not change Library/GameDetail behavior beyond moving the code.
- Conventional Commits for commit messages (e.g. `feat:`, `refactor:`, `test:`).

## Task Order Rationale / Known Intermediate States

- Task 1 changes `install/queue` behavior, so it patches the one `App.test.tsx` test that depends on the old routing. After Task 1 the whole vitest suite stays green.
- `AppRoute` keeps the `'downloads'` member until Task 7 (marked with a `// legacy route` comment) so `App.tsx` keeps compiling while the UI catches up. Task 7 removes it together with the last references.
- Nothing user-visible is wired until Tasks 6-9; each of those tasks ends green.

---

### Task 1: TypeScript domain model — routes, tags, mods, sign-out

**Files:**
- Modify: `src/domain/types.ts` (full replacement)
- Modify: `src/domain/state.ts` (full replacement)
- Modify: `src/data/seed.ts` (full replacement)
- Test: `src/domain/state.test.ts` (full replacement), `src/data/seed.test.ts` (full replacement)
- Modify: `src/App.test.tsx` (one test body only, see Step 6)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AppRoute = 'library' | 'catalog' | 'mods' | 'downloads'` (`'downloads'` legacy, removed in Task 7); `Game.tags: string[]`; `Mod` interface; `AppState.activeProfileId: string | null`; `AppState.mods: Record<string, Mod[]>`; actions `profile/signOut`, `mod/toggle`; `install/queue` no longer touches `route` and is a no-op when signed out; selectors `selectVisibleLibrary(state)`, `selectVisibleMods(state)` returning `[]` when signed out. Seed mods: `mod-openmw-tamriel-rebuilt`, `mod-openmw-rebirth`, `mod-openrct2-openmusic`, `mod-openrct2-scenarios`, `mod-devilutionx-infernal`, `mod-soh-hd-textures`; owner has exactly `mod-openmw-tamriel-rebuilt` enabled.

- [ ] **Step 1: Replace the failing tests first**

Replace `src/domain/state.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest';
import * as stateModule from './state';
import type { AppState } from './types';

function makeState(): AppState {
  return {
    activeProfileId: 'alex',
    selectedGameId: 'devilutionx',
    route: 'library',
    profiles: [
      { id: 'alex', displayName: 'Alex', avatarInitials: 'AL' },
      { id: 'mira', displayName: 'Mira', avatarInitials: 'MI' },
    ],
    games: [
      {
        id: 'devilutionx',
        title: 'DevilutionX',
        shortTitle: 'DX',
        summary: 'Diablo engine reconstruction',
        description: 'A careful source port.',
        artworkUrl: '',
        iconUrl: '',
        runtime: 'Native Linux',
        version: '1.5.4',
        executablePath: null,
        upstreamUrl: 'https://github.com/diasurgical/devilutionX',
        accent: '#a33b33',
        tags: ['RPG', 'Action'],
      },
      {
        id: 'openrct2',
        title: 'OpenRCT2',
        shortTitle: 'RCT',
        summary: 'Open-source RollerCoaster Tycoon 2',
        description: 'A modern recreation of RollerCoaster Tycoon 2.',
        artworkUrl: '',
        iconUrl: '',
        runtime: 'Native Linux',
        version: '0.5.4',
        executablePath: '/usr/bin/openrct2',
        upstreamUrl: 'https://openrct2.io',
        accent: '#5c8a45',
        tags: ['Simulation', 'Strategy'],
      },
    ],
    libraries: {
      alex: [
        {
          gameId: 'devilutionx',
          installState: 'available',
          installPath: null,
          playMinutes: 0,
        },
      ],
      mira: [
        {
          gameId: 'openrct2',
          installState: 'installed',
          installPath: '/games/openrct2',
          playMinutes: 421,
        },
      ],
    },
    mods: {
      alex: [
        {
          id: 'mod-devilutionx-infernal',
          gameId: 'devilutionx',
          name: 'Infernal Difficulty',
          summary: 'Brutal difficulty rebalance for veteran players.',
          version: '0.9',
          author: 'Community',
          enabled: false,
        },
      ],
      mira: [
        {
          id: 'mod-devilutionx-infernal',
          gameId: 'devilutionx',
          name: 'Infernal Difficulty',
          summary: 'Brutal difficulty rebalance for veteran players.',
          version: '0.9',
          author: 'Community',
          enabled: false,
        },
      ],
    },
    downloads: [],
    saveSnapshots: [],
    cloudProvider: null,
  };
}

describe('Classicomp application state', () => {
  it('switches profile and selects the first game in that profile library', () => {
    const initial = makeState();

    const next = stateModule.reduceAppState(initial, {
      type: 'profile/activate',
      profileId: 'mira',
    });

    expect(next.activeProfileId).toBe('mira');
    expect(next.selectedGameId).toBe('openrct2');
  });

  it('changes the active route without mutating the previous state', () => {
    const initial = makeState();
    const next = stateModule.reduceAppState(initial, {
      type: 'route/change',
      route: 'catalog',
    });

    expect(next.route).toBe('catalog');
    expect(initial.route).toBe('library');
  });

  it('selects a game and returns to its library detail page', () => {
    const initial = { ...makeState(), route: 'catalog' as const };
    const next = stateModule.reduceAppState(initial, {
      type: 'game/select',
      gameId: 'openrct2',
    });

    expect(next.selectedGameId).toBe('openrct2');
    expect(next.route).toBe('library');
  });

  it('queues one persistent download for an available game without changing route', () => {
    const initial = makeState();
    const next = stateModule.reduceAppState(initial, {
      type: 'install/queue',
      gameId: 'devilutionx',
    });
    const repeated = stateModule.reduceAppState(next, {
      type: 'install/queue',
      gameId: 'devilutionx',
    });

    expect(next.libraries.alex[0]?.installState).toBe('queued');
    expect(next.downloads).toEqual([
      {
        id: 'download-alex-devilutionx',
        profileId: 'alex',
        gameId: 'devilutionx',
        state: 'queued',
        progress: 0,
        bytesPerSecond: 0,
        etaSeconds: null,
      },
    ]);
    expect(next.route).toBe('library');
    expect(repeated.downloads).toHaveLength(1);
  });

  it('ignores install queue requests when signed out', () => {
    const initial = { ...makeState(), activeProfileId: null };
    const next = stateModule.reduceAppState(initial, {
      type: 'install/queue',
      gameId: 'devilutionx',
    });

    expect(next).toBe(initial);
  });

  it('signs out by clearing the active profile', () => {
    const next = stateModule.reduceAppState(makeState(), { type: 'profile/signOut' });

    expect(next.activeProfileId).toBeNull();
  });

  it('signs in again after signing out', () => {
    const signedOut = stateModule.reduceAppState(makeState(), { type: 'profile/signOut' });
    const next = stateModule.reduceAppState(signedOut, {
      type: 'profile/activate',
      profileId: 'mira',
    });

    expect(next.activeProfileId).toBe('mira');
    expect(next.selectedGameId).toBe('openrct2');
  });

  it('toggles a mod only for the active profile', () => {
    const next = stateModule.reduceAppState(makeState(), {
      type: 'mod/toggle',
      modId: 'mod-devilutionx-infernal',
    });

    expect(next.mods.alex[0]?.enabled).toBe(true);
    expect(next.mods.mira[0]?.enabled).toBe(false);
  });

  it('ignores mod toggles when signed out or for unknown mods', () => {
    const signedOut = { ...makeState(), activeProfileId: null };
    expect(
      stateModule.reduceAppState(signedOut, {
        type: 'mod/toggle',
        modId: 'mod-devilutionx-infernal',
      }),
    ).toBe(signedOut);

    const initial = makeState();
    expect(
      stateModule.reduceAppState(initial, { type: 'mod/toggle', modId: 'mod-unknown' }),
    ).toBe(initial);
  });

  it('returns no library entries or mods when signed out', () => {
    const signedOut = { ...makeState(), activeProfileId: null };

    expect(stateModule.selectVisibleLibrary(signedOut)).toEqual([]);
    expect(stateModule.selectVisibleMods(signedOut)).toEqual([]);
  });
});
```

Replace `src/data/seed.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest';
import * as seedModule from './seed';

describe('first-run state', () => {
  it('starts with an honest local-only catalog and valid game references', () => {
    const seedState = (seedModule as { seedState?: {
      cloudProvider: string | null;
      games: Array<{ id: string; tags: string[] }>;
      libraries: Record<string, Array<{ gameId: string; installState: string }>>;
      mods: Record<string, Array<{ gameId: string; enabled: boolean }>>;
      saveSnapshots: unknown[];
    } }).seedState;

    expect(seedState).toBeDefined();
    if (!seedState) return;

    const gameIds = new Set(seedState.games.map((game) => game.id));
    const entries = Object.values(seedState.libraries).flat();

    expect(seedState.cloudProvider).toBeNull();
    expect(seedState.saveSnapshots).toEqual([]);
    expect(entries.every((entry) => entry.installState === 'available')).toBe(true);
    expect(entries.every((entry) => gameIds.has(entry.gameId))).toBe(true);
    expect(seedState.games.every((game) => game.tags.length > 0)).toBe(true);

    const modEntries = Object.values(seedState.mods).flat();
    expect(modEntries.length).toBeGreaterThan(0);
    expect(modEntries.every((mod) => gameIds.has(mod.gameId))).toBe(true);
    expect(seedState.mods.owner?.filter((mod) => mod.enabled)).toHaveLength(1);
    expect(seedState.mods.guest?.every((mod) => !mod.enabled)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/state.test.ts src/data/seed.test.ts`
Expected: FAIL — `AppState` type errors/`enabled` mismatches (e.g. "mods" missing, `selectVisibleMods` not a function).

- [ ] **Step 3: Replace `src/domain/types.ts`**

Full replacement:

```ts
export type AppRoute = 'library' | 'catalog' | 'mods' | 'downloads'; // 'downloads' is a legacy route removed once the downloads bar lands
export type InstallState = 'installed' | 'available' | 'queued' | 'downloading';
export type DownloadState = 'queued' | 'downloading' | 'paused' | 'complete';
export type SaveState = 'local' | 'synced' | 'conflict';

export interface Profile {
  id: string;
  displayName: string;
  avatarInitials: string;
}

export interface Game {
  id: string;
  title: string;
  shortTitle: string;
  summary: string;
  description: string;
  artworkUrl: string | null;
  iconUrl: string | null;
  runtime: string;
  version: string;
  executablePath: string | null;
  upstreamUrl: string;
  accent: string;
  tags: string[];
}

export interface Mod {
  id: string;
  gameId: string;
  name: string;
  summary: string;
  version: string;
  author: string;
  enabled: boolean;
}

export interface LibraryEntry {
  gameId: string;
  installState: InstallState;
  installPath: string | null;
  playMinutes: number;
}

export interface Download {
  id: string;
  profileId: string;
  gameId: string;
  state: DownloadState;
  progress: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
}

export interface SaveSnapshot {
  id: string;
  profileId: string;
  gameId: string;
  deviceName: string;
  createdAt: string;
  state: SaveState;
  localPath: string;
}

export interface AppState {
  activeProfileId: string | null;
  selectedGameId: string;
  route: AppRoute;
  profiles: Profile[];
  games: Game[];
  libraries: Record<string, LibraryEntry[]>;
  mods: Record<string, Mod[]>;
  downloads: Download[];
  saveSnapshots: SaveSnapshot[];
  cloudProvider: string | null;
}

export type AppAction =
  | { type: 'profile/activate'; profileId: string }
  | { type: 'profile/signOut' }
  | { type: 'mod/toggle'; modId: string }
  | { type: 'route/change'; route: AppRoute }
  | { type: 'game/select'; gameId: string }
  | { type: 'install/queue'; gameId: string };
```

- [ ] **Step 4: Replace `src/domain/state.ts`**

Full replacement:

```ts
import type { AppAction, AppState, Game, LibraryEntry, Mod } from './types';

export function reduceAppState(state: AppState, action: AppAction): AppState {
  if (action.type === 'route/change') {
    return { ...state, route: action.route };
  }

  if (action.type === 'game/select') {
    return { ...state, selectedGameId: action.gameId, route: 'library' };
  }

  if (action.type === 'profile/signOut') {
    return { ...state, activeProfileId: null };
  }

  if (action.type === 'mod/toggle') {
    if (state.activeProfileId === null) return state;
    const mods = state.mods[state.activeProfileId];
    if (!mods?.some((mod) => mod.id === action.modId)) return state;

    return {
      ...state,
      mods: {
        ...state.mods,
        [state.activeProfileId]: mods.map((mod) =>
          mod.id === action.modId ? { ...mod, enabled: !mod.enabled } : mod,
        ),
      },
    };
  }

  if (action.type === 'install/queue') {
    if (state.activeProfileId === null) return state;
    const activeProfileId = state.activeProfileId;
    const downloadId = `download-${activeProfileId}-${action.gameId}`;
    if (state.downloads.some((download) => download.id === downloadId)) {
      return state;
    }

    const library = state.libraries[activeProfileId] ?? [];
    const hasEntry = library.some((entry) => entry.gameId === action.gameId);
    const nextLibrary = hasEntry
      ? library.map((entry) =>
          entry.gameId === action.gameId
            ? { ...entry, installState: 'queued' as const }
            : entry,
        )
      : [
          ...library,
          {
            gameId: action.gameId,
            installState: 'queued' as const,
            installPath: null,
            playMinutes: 0,
          },
        ];

    return {
      ...state,
      libraries: {
        ...state.libraries,
        [activeProfileId]: nextLibrary,
      },
      downloads: [
        ...state.downloads,
        {
          id: downloadId,
          profileId: activeProfileId,
          gameId: action.gameId,
          state: 'queued',
          progress: 0,
          bytesPerSecond: 0,
          etaSeconds: null,
        },
      ],
    };
  }

  if (action.type !== 'profile/activate') return state;

  const firstGame = state.libraries[action.profileId]?.[0]?.gameId;
  if (!firstGame) return state;

  return {
    ...state,
    activeProfileId: action.profileId,
    selectedGameId: firstGame,
  };
}

export function selectVisibleLibrary(state: AppState): LibraryEntry[] {
  if (state.activeProfileId === null) return [];
  return state.libraries[state.activeProfileId] ?? [];
}

export function selectVisibleMods(state: AppState): Mod[] {
  if (state.activeProfileId === null) return [];
  return state.mods[state.activeProfileId] ?? [];
}

export function selectGame(state: AppState, gameId: string): Game | undefined {
  return state.games.find((game) => game.id === gameId);
}
```

- [ ] **Step 5: Replace `src/data/seed.ts`**

Full replacement:

```ts
import type { AppState, Game, LibraryEntry, Mod } from '../domain/types';

const games: Game[] = [
  {
    id: 'openrct2',
    title: 'OpenRCT2',
    shortTitle: 'RCT',
    summary: 'Open-source reimplementation of RollerCoaster Tycoon 2',
    description:
      'A modern engine for RollerCoaster Tycoon 2 with cross-platform support, expanded limits, and active upstream releases.',
    artworkUrl: '/artwork/openrct2-hero.jpg',
    iconUrl: '/artwork/openrct2-icon.png',
    runtime: 'Native Linux',
    version: '0.5.4',
    executablePath: null,
    upstreamUrl: 'https://openrct2.io',
    accent: '#648f46',
    tags: ['Simulation', 'Strategy'],
  },
  {
    id: 'devilutionx',
    title: 'DevilutionX',
    shortTitle: 'DX',
    summary: 'Modern source port of Diablo and Hellfire',
    description:
      'A maintained engine reconstruction focused on accurate gameplay, modern systems, and portable builds.',
    artworkUrl: '/artwork/devilutionx-hero.png',
    iconUrl: '/artwork/devilutionx-icon.png',
    runtime: 'Native Linux',
    version: '1.5.4',
    executablePath: null,
    upstreamUrl: 'https://github.com/diasurgical/devilutionX',
    accent: '#9b433b',
    tags: ['RPG', 'Action'],
  },
  {
    id: 'openmw',
    title: 'OpenMW',
    shortTitle: 'MW',
    summary: 'Open-source engine for Morrowind',
    description:
      'A clean-room engine implementation with a native Linux runtime, modern tooling, and strong mod support.',
    artworkUrl: '/artwork/openmw-hero.png',
    iconUrl: '/artwork/openmw-icon.jpg',
    runtime: 'Native Linux',
    version: '0.49.0',
    executablePath: null,
    upstreamUrl: 'https://openmw.org',
    accent: '#8a6b3f',
    tags: ['RPG', 'Open World'],
  },
  {
    id: 'openttd',
    title: 'OpenTTD',
    shortTitle: 'TTD',
    summary: 'Transport simulation engine reimplementation',
    description:
      'A long-running open-source transport simulation with native Linux releases and multiplayer support.',
    artworkUrl: '/artwork/openttd-hero.png',
    iconUrl: '/artwork/openttd-icon.png',
    runtime: 'Native Linux',
    version: '15.1',
    executablePath: null,
    upstreamUrl: 'https://www.openttd.org',
    accent: '#4c7693',
    tags: ['Simulation', 'Strategy'],
  },
  {
    id: 'scummvm',
    title: 'ScummVM',
    shortTitle: 'SC',
    summary: 'Adventure game engine collection',
    description:
      'A compatibility layer for many classic point-and-click adventure engines with broad platform support.',
    artworkUrl: '/artwork/scummvm-hero.jpg',
    iconUrl: '/artwork/scummvm-icon.jpg',
    runtime: 'Native Linux',
    version: '2.9.1',
    executablePath: null,
    upstreamUrl: 'https://www.scummvm.org',
    accent: '#5a7e9d',
    tags: ['Adventure', 'Point & Click'],
  },
  {
    id: 'soh',
    title: 'Ship of Harkinian',
    shortTitle: 'SOH',
    summary: 'PC port of the Ocarina of Time engine',
    description:
      'A community-built native port with modern rendering, input, accessibility, and quality-of-life options.',
    artworkUrl: null,
    iconUrl: '/artwork/soh-icon.png',
    runtime: 'Native Linux',
    version: 'MacReady Golf',
    executablePath: null,
    upstreamUrl: 'https://www.shipofharkinian.com',
    accent: '#6a7750',
    tags: ['Adventure', 'Action'],
  },
  {
    id: 'zelda64recompiled',
    title: 'Zelda 64: Recompiled',
    shortTitle: 'Z64',
    summary: 'Static recompilation of Majora\'s Mask',
    description:
      'A native recompilation project with modern rendering, ultrawide support, and high frame-rate presentation.',
    artworkUrl: null,
    iconUrl: '/artwork/zelda64recompiled-icon.png',
    runtime: 'Native Linux',
    version: '1.2.2',
    executablePath: null,
    upstreamUrl: 'https://github.com/Zelda64Recomp/Zelda64Recomp',
    accent: '#765a88',
    tags: ['Adventure', 'Action'],
  },
];

const modCatalog: Array<Omit<Mod, 'enabled'>> = [
  {
    id: 'mod-openmw-tamriel-rebuilt',
    gameId: 'openmw',
    name: 'Tamriel Rebuilt',
    summary: 'Adds the Morrowind mainland with new regions and quests.',
    version: '24.12',
    author: 'Tamriel Rebuilt Team',
  },
  {
    id: 'mod-openmw-rebirth',
    gameId: 'openmw',
    name: 'Morrowind Rebirth',
    summary: 'Overhaul of landscapes, cities, and balance.',
    version: '7.0',
    author: 'trancemaster_198',
  },
  {
    id: 'mod-openrct2-openmusic',
    gameId: 'openrct2',
    name: 'OpenMusic',
    summary: 'Open-source ride and scenery music pack.',
    version: '1.2',
    author: 'OpenRCT2 Community',
  },
  {
    id: 'mod-openrct2-scenarios',
    gameId: 'openrct2',
    name: 'Classic Scenarios Pack',
    summary: 'Recreates the original RCT1 scenario lineup.',
    version: '2025.1',
    author: 'OpenRCT2 Community',
  },
  {
    id: 'mod-devilutionx-infernal',
    gameId: 'devilutionx',
    name: 'Infernal Difficulty',
    summary: 'Brutal difficulty rebalance for veteran players.',
    version: '0.9',
    author: 'Community',
  },
  {
    id: 'mod-soh-hd-textures',
    gameId: 'soh',
    name: 'HD Texture Pack',
    summary: 'High-resolution texture replacements.',
    version: '3.1',
    author: 'Community',
  },
];

function availableLibrary(): LibraryEntry[] {
  return games.map((game) => ({
    gameId: game.id,
    installState: 'available',
    installPath: null,
    playMinutes: 0,
  }));
}

function modLibrary(enabledModIds: string[]): Mod[] {
  return modCatalog.map((mod) => ({ ...mod, enabled: enabledModIds.includes(mod.id) }));
}

export const seedState: AppState = {
  activeProfileId: 'owner',
  selectedGameId: 'openrct2',
  route: 'library',
  profiles: [
    { id: 'owner', displayName: 'The Dictator', avatarInitials: 'TD' },
    { id: 'guest', displayName: 'Guest', avatarInitials: 'GU' },
  ],
  games,
  libraries: {
    owner: availableLibrary(),
    guest: availableLibrary(),
  },
  mods: {
    owner: modLibrary(['mod-openmw-tamriel-rebuilt']),
    guest: modLibrary([]),
  },
  downloads: [],
  saveSnapshots: [],
  cloudProvider: null,
};
```

- [ ] **Step 6: Patch the queue test in `src/App.test.tsx`**

The third test still expects queuing to navigate to a Downloads page. Replace that whole `it(...)` block (lines starting `it('queues a catalog game and shows the persisted download', ...)`) with:

```ts
  it('queues a catalog game and keeps the catalog route', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('tab', { name: 'Catalog' }));
    await user.click(screen.getByRole('button', { name: 'Queue DevilutionX install' }));

    expect(screen.getByRole('tab', { name: 'Catalog' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 queued');
    expect(JSON.parse(storage.getItem('classicomp.app-state.v1') ?? '{}').downloads).toHaveLength(1);
  });
```

- [ ] **Step 7: Run the full vitest suite**

Run: `npm test`
Expected: PASS (all files). Note: `npx tsc -b` will still complain about `'downloads'` comparisons in `src/App.tsx`; that is intentional until Task 7 and must not be "fixed" here.

- [ ] **Step 8: Commit**

```bash
git add src/domain/types.ts src/domain/state.ts src/data/seed.ts src/domain/state.test.ts src/data/seed.test.ts src/App.test.tsx
git commit -m "feat: add tags, mods, and sign-out to the domain model"
```

---

### Task 2: Catalog filter domain module

**Files:**
- Create: `src/domain/catalog.ts`
- Test: `src/domain/catalog.test.ts`

**Interfaces:**
- Consumes: `Game`, `LibraryEntry` from `./types` (Task 1).
- Produces: `CatalogFilters { query: string; tags: string[]; installState: 'all' | 'installed' | 'not-installed'; runtime: 'all' | string }`; `EMPTY_CATALOG_FILTERS: CatalogFilters`; `collectTags(games: Game[]): string[]`; `collectRuntimes(games: Game[]): string[]`; `filterCatalog(games: Game[], library: LibraryEntry[], filters: CatalogFilters): Game[]`. Tag narrowing is AND. Anything not `installed` counts as not installed. Used by Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/domain/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_CATALOG_FILTERS, collectRuntimes, collectTags, filterCatalog } from './catalog';
import type { Game, LibraryEntry } from './types';

function makeGame(overrides: Partial<Game>): Game {
  return {
    id: 'game',
    title: 'Game',
    shortTitle: 'G',
    summary: 'A game',
    description: 'A longer description.',
    artworkUrl: null,
    iconUrl: null,
    runtime: 'Native Linux',
    version: '1.0',
    executablePath: null,
    upstreamUrl: 'https://example.com',
    accent: '#000000',
    tags: [],
    ...overrides,
  };
}

const games: Game[] = [
  makeGame({
    id: 'openmw',
    title: 'OpenMW',
    summary: 'Open-source engine for Morrowind',
    tags: ['RPG', 'Open World'],
  }),
  makeGame({
    id: 'devilutionx',
    title: 'DevilutionX',
    summary: 'Modern source port of Diablo and Hellfire',
    tags: ['RPG', 'Action'],
  }),
  makeGame({
    id: 'openttd',
    title: 'OpenTTD',
    summary: 'Transport simulation engine reimplementation',
    tags: ['Simulation', 'Strategy'],
    runtime: 'Wine',
  }),
];

const library: LibraryEntry[] = [
  { gameId: 'openmw', installState: 'installed', installPath: '/games/openmw', playMinutes: 42 },
  { gameId: 'devilutionx', installState: 'queued', installPath: null, playMinutes: 0 },
];

describe('catalog filtering', () => {
  it('matches the search query against title and summary', () => {
    const byTitle = filterCatalog(games, library, { ...EMPTY_CATALOG_FILTERS, query: 'openttd' });
    expect(byTitle.map((game) => game.id)).toEqual(['openttd']);

    const bySummary = filterCatalog(games, library, { ...EMPTY_CATALOG_FILTERS, query: 'diablo' });
    expect(bySummary.map((game) => game.id)).toEqual(['devilutionx']);
  });

  it('narrows with AND semantics when several tags are selected', () => {
    const rpg = filterCatalog(games, library, { ...EMPTY_CATALOG_FILTERS, tags: ['RPG'] });
    expect(rpg.map((game) => game.id)).toEqual(['openmw', 'devilutionx']);

    const rpgAction = filterCatalog(games, library, {
      ...EMPTY_CATALOG_FILTERS,
      tags: ['RPG', 'Action'],
    });
    expect(rpgAction.map((game) => game.id)).toEqual(['devilutionx']);
  });

  it('filters by install state, counting queued games as not installed', () => {
    const installed = filterCatalog(games, library, {
      ...EMPTY_CATALOG_FILTERS,
      installState: 'installed',
    });
    expect(installed.map((game) => game.id)).toEqual(['openmw']);

    const notInstalled = filterCatalog(games, library, {
      ...EMPTY_CATALOG_FILTERS,
      installState: 'not-installed',
    });
    expect(notInstalled.map((game) => game.id)).toEqual(['devilutionx', 'openttd']);
  });

  it('filters by runtime', () => {
    const wine = filterCatalog(games, library, { ...EMPTY_CATALOG_FILTERS, runtime: 'Wine' });
    expect(wine.map((game) => game.id)).toEqual(['openttd']);
  });

  it('combines filters and can return an empty list', () => {
    const combined = filterCatalog(games, library, {
      query: 'engine',
      tags: ['RPG'],
      installState: 'installed',
      runtime: 'Native Linux',
    });
    expect(combined.map((game) => game.id)).toEqual(['openmw']);

    const empty = filterCatalog(games, library, {
      ...EMPTY_CATALOG_FILTERS,
      query: 'no such game',
    });
    expect(empty).toEqual([]);
  });

  it('collects distinct sorted tags and runtimes', () => {
    expect(collectTags(games)).toEqual(['Action', 'Open World', 'RPG', 'Simulation', 'Strategy']);
    expect(collectRuntimes(games)).toEqual(['Native Linux', 'Wine']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/catalog.test.ts`
Expected: FAIL — module `./catalog` does not exist / has no exports.

- [ ] **Step 3: Implement `src/domain/catalog.ts`**

```ts
import type { Game, LibraryEntry } from './types';

export interface CatalogFilters {
  query: string;
  tags: string[];
  installState: 'all' | 'installed' | 'not-installed';
  runtime: 'all' | string;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  query: '',
  tags: [],
  installState: 'all',
  runtime: 'all',
};

export function collectTags(games: Game[]): string[] {
  return [...new Set(games.flatMap((game) => game.tags))].sort();
}

export function collectRuntimes(games: Game[]): string[] {
  return [...new Set(games.map((game) => game.runtime))].sort();
}

export function filterCatalog(
  games: Game[],
  library: LibraryEntry[],
  filters: CatalogFilters,
): Game[] {
  const query = filters.query.trim().toLowerCase();

  return games.filter((game) => {
    if (query.length > 0) {
      const haystack = `${game.title} ${game.summary}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (!filters.tags.every((tag) => game.tags.includes(tag))) return false;

    const installed = library.some(
      (entry) => entry.gameId === game.id && entry.installState === 'installed',
    );
    if (filters.installState === 'installed' && !installed) return false;
    if (filters.installState === 'not-installed' && installed) return false;

    if (filters.runtime !== 'all' && game.runtime !== filters.runtime) return false;

    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/catalog.ts src/domain/catalog.test.ts
git commit -m "feat: add pure catalog filtering with search, tags, and state filters"
```

---

### Task 3: Platform bridges — signOut, toggleMod, storage v2

**Files:**
- Modify: `src/platform/bridge.ts` (full replacement)
- Modify: `src/platform/browser-store.ts` (full replacement)
- Modify: `src/platform/tauri-store.ts` (full replacement)
- Test: `src/platform/browser-store.test.ts` (full replacement), `src/platform/tauri-store.test.ts` (full replacement)
- Modify: `src/App.test.tsx` (single string change, see Step 4)

**Interfaces:**
- Consumes: `profile/signOut`, `mod/toggle` reducer actions (Task 1). Rust commands `sign_out`, `toggle_mod` land in Task 4; the TS bridge only references their names as strings.
- Produces: `PlatformBridge { loadState(); setActiveProfile(profileId); signOut(); queueInstall(gameId); toggleMod(modId); }` — all returning `Promise<AppState>`. Browser storage key `classicomp.app-state.v2`; persisted unknown `route` values sanitize to `'library'`.

- [ ] **Step 1: Replace the failing tests first**

Replace `src/platform/browser-store.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest';
import * as browserStoreModule from './browser-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('browser persistence bridge', () => {
  it('restores the active profile from persisted browser state', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;

    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);
    await firstRun.setActiveProfile('guest');

    const restarted = createBrowserBridge(storage);
    expect((await restarted.loadState()).activeProfileId).toBe('guest');
  });

  it('persists one queued install across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.queueInstall('devilutionx');
    await firstRun.queueInstall('devilutionx');

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(state.downloads).toHaveLength(1);
    expect(state.downloads[0]).toMatchObject({
      gameId: 'devilutionx',
      profileId: 'owner',
      state: 'queued',
    });
  });

  it('persists sign-out across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.signOut();
    const restarted = createBrowserBridge(storage);
    expect((await restarted.loadState()).activeProfileId).toBeNull();

    await restarted.setActiveProfile('guest');
    expect((await createBrowserBridge(storage).loadState()).activeProfileId).toBe('guest');
  });

  it('persists mod toggles across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.toggleMod('mod-openmw-rebirth');

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(state.mods.owner?.find((mod) => mod.id === 'mod-openmw-rebirth')?.enabled).toBe(true);
    expect(state.mods.guest?.find((mod) => mod.id === 'mod-openmw-rebirth')?.enabled).toBe(false);
  });

  it('maps a legacy persisted downloads route to the library', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();

    const firstRun = createBrowserBridge(storage);
    const state = await firstRun.loadState();
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, route: 'downloads' }),
    );

    expect((await createBrowserBridge(storage).loadState()).route).toBe('library');
  });
});
```

Replace `src/platform/tauri-store.test.ts` entirely:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { createDefaultBridge } from './default-bridge';
import { createTauriBridge } from './tauri-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const invoke = vi.fn();
const isTauri = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => isTauri(),
}));

describe('Tauri bridge', () => {
  beforeEach(() => {
    invoke.mockReset();
    isTauri.mockReset();
  });

  it('invokes native commands with stable command names and camelCase args', async () => {
    invoke.mockResolvedValue(seedState);

    const bridge = createTauriBridge();
    await bridge.loadState();
    await bridge.setActiveProfile('guest');
    await bridge.queueInstall('openmw');
    await bridge.signOut();
    await bridge.toggleMod('mod-openmw-rebirth');

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_state');
    expect(invoke).toHaveBeenNthCalledWith(2, 'set_active_profile', { profileId: 'guest' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'queue_install', { gameId: 'openmw' });
    expect(invoke).toHaveBeenNthCalledWith(4, 'sign_out');
    expect(invoke).toHaveBeenNthCalledWith(5, 'toggle_mod', { modId: 'mod-openmw-rebirth' });
  });

  it('selects Tauri only when the runtime reports a Tauri shell', () => {
    isTauri.mockReturnValue(false);
    expect(createDefaultBridge(new MemoryStorage())).toHaveProperty('loadState');
    expect(invoke).not.toHaveBeenCalled();

    isTauri.mockReturnValue(true);
    expect(createDefaultBridge()).toHaveProperty('queueInstall');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/platform/browser-store.test.ts src/platform/tauri-store.test.ts`
Expected: FAIL — `firstRun.signOut is not a function` / `bridge.signOut is not a function`.

- [ ] **Step 3: Replace the bridge implementations**

Replace `src/platform/bridge.ts` entirely:

```ts
import type { AppState } from '../domain/types';

export interface PlatformBridge {
  loadState(): Promise<AppState>;
  setActiveProfile(profileId: string): Promise<AppState>;
  signOut(): Promise<AppState>;
  queueInstall(gameId: string): Promise<AppState>;
  toggleMod(modId: string): Promise<AppState>;
}
```

Replace `src/platform/browser-store.ts` entirely:

```ts
import { seedState } from '../data/seed';
import { reduceAppState } from '../domain/state';
import type { AppRoute, AppState } from '../domain/types';

const STORAGE_KEY = 'classicomp.app-state.v2';
const KNOWN_ROUTES: AppRoute[] = ['library', 'catalog', 'mods'];

function cloneSeedState(): AppState {
  return structuredClone(seedState);
}

function sanitizeRoute(state: AppState): AppState {
  return KNOWN_ROUTES.includes(state.route) ? state : { ...state, route: 'library' };
}

function readState(storage: Storage): AppState {
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return cloneSeedState();

  try {
    return sanitizeRoute(JSON.parse(stored) as AppState);
  } catch {
    return cloneSeedState();
  }
}

function writeState(storage: Storage, state: AppState): AppState {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function createBrowserBridge(storage: Storage) {
  return {
    async loadState(): Promise<AppState> {
      return readState(storage);
    },

    async setActiveProfile(profileId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'profile/activate',
        profileId,
      });
      return writeState(storage, next);
    },

    async signOut(): Promise<AppState> {
      const next = reduceAppState(readState(storage), { type: 'profile/signOut' });
      return writeState(storage, next);
    },

    async queueInstall(gameId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'install/queue',
        gameId,
      });
      return writeState(storage, next);
    },

    async toggleMod(modId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), { type: 'mod/toggle', modId });
      return writeState(storage, next);
    },
  };
}
```

Replace `src/platform/tauri-store.ts` entirely:

```ts
import { invoke } from '@tauri-apps/api/core';
import type { AppState } from '../domain/types';
import type { PlatformBridge } from './bridge';

export function createTauriBridge(): PlatformBridge {
  return {
    loadState(): Promise<AppState> {
      return invoke<AppState>('load_state');
    },

    setActiveProfile(profileId: string): Promise<AppState> {
      return invoke<AppState>('set_active_profile', { profileId });
    },

    signOut(): Promise<AppState> {
      return invoke<AppState>('sign_out');
    },

    queueInstall(gameId: string): Promise<AppState> {
      return invoke<AppState>('queue_install', { gameId });
    },

    toggleMod(modId: string): Promise<AppState> {
      return invoke<AppState>('toggle_mod', { modId });
    },
  };
}
```

- [ ] **Step 4: Update the storage key in `src/App.test.tsx`**

In `src/App.test.tsx`, find the line added in Task 1:

```ts
    expect(JSON.parse(storage.getItem('classicomp.app-state.v1') ?? '{}').downloads).toHaveLength(1);
```

Change `classicomp.app-state.v1` to `classicomp.app-state.v2`.

- [ ] **Step 5: Run the full vitest suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/platform/bridge.ts src/platform/browser-store.ts src/platform/tauri-store.ts src/platform/browser-store.test.ts src/platform/tauri-store.test.ts src/App.test.tsx
git commit -m "feat: add sign-out and mod toggles to the platform bridges"
```

---

### Task 4: Rust database and commands

**Files:**
- Modify: `src-tauri/src/database.rs` (changes throughout; full new/changed items below)
- Modify: `src-tauri/src/lib.rs` (full replacement)
- Test: `src-tauri/tests/database.rs` (full replacement)

**Interfaces:**
- Consumes: the approved seed data (same tags/mods as Task 1's TS seed).
- Produces: `AppState.active_profile_id: Option<String>`; `Game.tags: Vec<String>`; `Mod` struct; `AppState.mods: HashMap<String, Vec<Mod>>`; `Database::sign_out()`, `Database::toggle_mod(profile_id, mod_id)`; `queue_install` no longer persists a route; `load_state` sanitizes unknown routes to `"library"` and returns empty downloads/save snapshots when signed out. Tauri commands `sign_out`, `toggle_mod` registered in the handler. Serde field names stay camelCase (`activeProfileId`, `mods`, `tags`), matching the TS types from Task 1.

- [ ] **Step 1: Replace the failing tests first**

Replace `src-tauri/tests/database.rs` entirely:

```rust
use classicomp_lib::database::Database;

#[test]
fn new_database_seeds_profiles_games_tags_mods_and_local_only_cloud_state() {
    let database = Database::open_memory().expect("database opens");
    let state = database.load_state().expect("state loads");

    assert_eq!(state.active_profile_id, Some("owner".to_string()));
    assert_eq!(state.profiles.len(), 2);
    assert_eq!(state.cloud_provider, None);
    assert!(state.downloads.is_empty());
    assert!(
        state.libraries["owner"]
            .iter()
            .all(|entry| entry.install_state == "available")
    );

    let openrct2 = state
        .games
        .iter()
        .find(|game| game.id == "openrct2")
        .expect("openrct2 exists");
    assert!(openrct2.tags.contains(&"Simulation".to_string()));
    assert!(openrct2.tags.contains(&"Strategy".to_string()));

    let tamriel = state.mods["owner"]
        .iter()
        .find(|module| module.id == "mod-openmw-tamriel-rebuilt")
        .expect("seed mod exists");
    assert!(tamriel.enabled);
    assert!(state.mods["guest"].iter().all(|module| !module.enabled));
}

#[test]
fn queue_install_persists_library_entry_and_download_without_duplicates() {
    let database = Database::open_memory().expect("database opens");

    database
        .queue_install("owner", "devilutionx")
        .expect("install queues");
    database
        .queue_install("owner", "devilutionx")
        .expect("second queue is idempotent");

    let state = database.load_state().expect("state loads");
    let owner_library = &state.libraries["owner"];
    let entry = owner_library
        .iter()
        .find(|entry| entry.game_id == "devilutionx")
        .expect("devilutionx library entry exists");

    assert_eq!(entry.install_state, "queued");
    assert_eq!(state.downloads.len(), 1);
    assert_eq!(state.downloads[0].game_id, "devilutionx");
    assert_eq!(state.route, "library");
}

#[test]
fn sign_out_clears_the_active_profile_until_one_is_activated() {
    let database = Database::open_memory().expect("database opens");

    database.sign_out().expect("sign out works");
    let state = database.load_state().expect("state loads");
    assert_eq!(state.active_profile_id, None);
    assert!(state.downloads.is_empty());
    assert!(state.save_snapshots.is_empty());

    database.set_active_profile("guest").expect("sign in works");
    let state = database.load_state().expect("state loads");
    assert_eq!(state.active_profile_id, Some("guest".to_string()));
}

#[test]
fn toggle_mod_flips_enabled_state_for_one_profile_only() {
    let database = Database::open_memory().expect("database opens");

    database
        .toggle_mod("owner", "mod-openmw-rebirth")
        .expect("toggle works");
    let state = database.load_state().expect("state loads");
    assert!(
        state.mods["owner"]
            .iter()
            .find(|module| module.id == "mod-openmw-rebirth")
            .expect("mod exists")
            .enabled
    );
    assert!(
        !state.mods["guest"]
            .iter()
            .find(|module| module.id == "mod-openmw-rebirth")
            .expect("mod exists")
            .enabled
    );

    database
        .toggle_mod("owner", "mod-openmw-rebirth")
        .expect("second toggle works");
    let state = database.load_state().expect("state loads");
    assert!(
        !state.mods["owner"]
            .iter()
            .find(|module| module.id == "mod-openmw-rebirth")
            .expect("mod exists")
            .enabled
    );
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:rust`
Expected: FAIL — compile errors (`sign_out`, `toggle_mod`, `tags`, `mods` missing; `active_profile_id` type mismatch).

- [ ] **Step 3: Update `src-tauri/src/database.rs` structs**

Add the `Mod` struct after the `SaveSnapshot` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Mod {
    pub id: String,
    pub game_id: String,
    pub name: String,
    pub summary: String,
    pub version: String,
    pub author: String,
    pub enabled: bool,
}
```

In `struct Game`, add a `tags` field after `accent`:

```rust
    pub accent: String,
    pub tags: Vec<String>,
}
```

Replace `struct AppState` with:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub active_profile_id: Option<String>,
    pub selected_game_id: String,
    pub route: String,
    pub profiles: Vec<Profile>,
    pub games: Vec<Game>,
    pub libraries: HashMap<String, Vec<LibraryEntry>>,
    pub mods: HashMap<String, Vec<Mod>>,
    pub downloads: Vec<Download>,
    pub save_snapshots: Vec<SaveSnapshot>,
    pub cloud_provider: Option<String>,
}
```

- [ ] **Step 4: Update schema, seed, and loaders in `database.rs`**

In `migrate()`, append these tables to the `execute_batch` SQL (after the `app_settings` table):

```sql
            create table if not exists game_tags (
              game_id text not null references games(id) on delete cascade,
              tag text not null,
              primary key (game_id, tag)
            );

            create table if not exists mods (
              id text primary key,
              game_id text not null references games(id) on delete cascade,
              name text not null,
              summary text not null,
              version text not null,
              author text not null
            );

            create table if not exists profile_mods (
              profile_id text not null references profiles(id) on delete cascade,
              mod_id text not null references mods(id) on delete cascade,
              enabled integer not null default 0,
              primary key (profile_id, mod_id)
            );
```

In both `open()` and `open_memory()`, add a call after `seed_if_empty()?;`:

```rust
        database.seed_if_empty()?;
        database.fill_reference_tables_if_empty()?;
```

Add this new method to `impl Database` (it covers both fresh and existing databases):

```rust
    fn fill_reference_tables_if_empty(&self) -> Result<()> {
        let tag_count: i64 = self
            .connection
            .query_row("select count(*) from game_tags", [], |row| row.get(0))?;
        if tag_count == 0 {
            for game in seed_games() {
                for tag in &game.tags {
                    self.connection.execute(
                        "insert into game_tags (game_id, tag) values (?1, ?2)",
                        params![game.id, tag],
                    )?;
                }
            }
        }

        let mod_count: i64 = self
            .connection
            .query_row("select count(*) from mods", [], |row| row.get(0))?;
        if mod_count == 0 {
            for module in seed_mods() {
                self.connection.execute(
                    "insert into mods (id, game_id, name, summary, version, author)
                     values (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        module.id,
                        module.game_id,
                        module.name,
                        module.summary,
                        module.version,
                        module.author
                    ],
                )?;
            }
        }

        let profile_mod_count: i64 = self
            .connection
            .query_row("select count(*) from profile_mods", [], |row| row.get(0))?;
        if profile_mod_count == 0 {
            self.connection.execute(
                "insert into profile_mods (profile_id, mod_id, enabled)
                 values ('owner', 'mod-openmw-tamriel-rebuilt', 1)",
                [],
            )?;
        }

        Ok(())
    }
```

Replace `load_state` with:

```rust
    pub fn load_state(&self) -> Result<AppState> {
        let active_profile_id = self.setting("active_profile_id")?;
        let selected_game_id = self
            .setting("selected_game_id")?
            .unwrap_or_else(|| "openrct2".to_string());
        let route = match self.setting("route")?.as_deref() {
            Some("catalog") => "catalog".to_string(),
            Some("mods") => "mods".to_string(),
            _ => "library".to_string(),
        };
        let cloud_provider = self.setting("cloud_provider")?;

        let profiles = self.profiles()?;
        let games = self.games()?;
        let libraries = self.libraries()?;
        let mods = self.mods()?;
        let downloads = match &active_profile_id {
            Some(profile_id) => self.downloads(profile_id)?,
            None => Vec::new(),
        };
        let save_snapshots = match &active_profile_id {
            Some(profile_id) => self.save_snapshots(profile_id)?,
            None => Vec::new(),
        };

        Ok(AppState {
            active_profile_id,
            selected_game_id,
            route,
            profiles,
            games,
            libraries,
            mods,
            downloads,
            save_snapshots,
            cloud_provider,
        })
    }
```

Add `sign_out` and `toggle_mod` next to `set_active_profile`:

```rust
    pub fn sign_out(&self) -> Result<()> {
        self.upsert_setting("active_profile_id", None)
    }

    pub fn toggle_mod(&self, profile_id: &str, mod_id: &str) -> Result<()> {
        self.connection.execute(
            "insert into profile_mods (profile_id, mod_id, enabled) values (?1, ?2, 1)
             on conflict(profile_id, mod_id) do update set enabled = 1 - enabled",
            params![profile_id, mod_id],
        )?;
        Ok(())
    }
```

In `queue_install`, delete these two lines (the route no longer changes):

```rust
        self.upsert_setting("route", Some("downloads"))?;
```

In `games()`, attach tags after collecting the rows. Replace the `Ok(statement ... collect ...)` tail of `games()` so it reads:

```rust
        let mut games = statement
            .query_map([], |row| {
                Ok(Game {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    short_title: row.get(2)?,
                    summary: row.get(3)?,
                    description: row.get(4)?,
                    artwork_url: row.get(5)?,
                    icon_url: row.get(6)?,
                    runtime: row.get(7)?,
                    version: row.get(8)?,
                    executable_path: row.get(9)?,
                    upstream_url: row.get(10)?,
                    accent: row.get(11)?,
                    tags: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for game in &mut games {
            game.tags = self.game_tags(&game.id)?;
        }
        Ok(games)
    }
```

Add the `game_tags` and `mods` helpers to `impl Database`:

```rust
    fn game_tags(&self, game_id: &str) -> Result<Vec<String>> {
        let mut statement = self
            .connection
            .prepare("select tag from game_tags where game_id = ?1 order by tag")?;
        let tags = statement.query_map([game_id], |row| row.get::<_, String>(0))?;
        Ok(tags.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn mods(&self) -> Result<HashMap<String, Vec<Mod>>> {
        let mut statement = self.connection.prepare(
            "select p.id, m.id, m.game_id, m.name, m.summary, m.version, m.author,
                    coalesce(pm.enabled, 0)
             from profiles p
             cross join mods m
             left join profile_mods pm on pm.profile_id = p.id and pm.mod_id = m.id
             order by p.rowid, m.rowid",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Mod {
                    id: row.get(1)?,
                    game_id: row.get(2)?,
                    name: row.get(3)?,
                    summary: row.get(4)?,
                    version: row.get(5)?,
                    author: row.get(6)?,
                    enabled: row.get::<_, i64>(7)? != 0,
                },
            ))
        })?;

        let mut mods: HashMap<String, Vec<Mod>> = HashMap::new();
        for row in rows {
            let (profile_id, module) = row?;
            mods.entry(profile_id).or_default().push(module);
        }
        Ok(mods)
    }
```

In `seed_games()`, add the `tags` field to each `Game` literal, matching the TS seed exactly:

- openrct2: `tags: vec!["Simulation".into(), "Strategy".into()],`
- devilutionx: `tags: vec!["RPG".into(), "Action".into()],`
- openmw: `tags: vec!["RPG".into(), "Open World".into()],`
- openttd: `tags: vec!["Simulation".into(), "Strategy".into()],`
- scummvm: `tags: vec!["Adventure".into(), "Point & Click".into()],`
- soh: `tags: vec!["Adventure".into(), "Action".into()],`
- zelda64recompiled: `tags: vec!["Adventure".into(), "Action".into()],`

Add `seed_mods()` after `seed_games()`:

```rust
fn seed_mods() -> Vec<Mod> {
    vec![
        Mod {
            id: "mod-openmw-tamriel-rebuilt".into(),
            game_id: "openmw".into(),
            name: "Tamriel Rebuilt".into(),
            summary: "Adds the Morrowind mainland with new regions and quests.".into(),
            version: "24.12".into(),
            author: "Tamriel Rebuilt Team".into(),
            enabled: false,
        },
        Mod {
            id: "mod-openmw-rebirth".into(),
            game_id: "openmw".into(),
            name: "Morrowind Rebirth".into(),
            summary: "Overhaul of landscapes, cities, and balance.".into(),
            version: "7.0".into(),
            author: "trancemaster_198".into(),
            enabled: false,
        },
        Mod {
            id: "mod-openrct2-openmusic".into(),
            game_id: "openrct2".into(),
            name: "OpenMusic".into(),
            summary: "Open-source ride and scenery music pack.".into(),
            version: "1.2".into(),
            author: "OpenRCT2 Community".into(),
            enabled: false,
        },
        Mod {
            id: "mod-openrct2-scenarios".into(),
            game_id: "openrct2".into(),
            name: "Classic Scenarios Pack".into(),
            summary: "Recreates the original RCT1 scenario lineup.".into(),
            version: "2025.1".into(),
            author: "OpenRCT2 Community".into(),
            enabled: false,
        },
        Mod {
            id: "mod-devilutionx-infernal".into(),
            game_id: "devilutionx".into(),
            name: "Infernal Difficulty".into(),
            summary: "Brutal difficulty rebalance for veteran players.".into(),
            version: "0.9".into(),
            author: "Community".into(),
            enabled: false,
        },
        Mod {
            id: "mod-soh-hd-textures".into(),
            game_id: "soh".into(),
            name: "HD Texture Pack".into(),
            summary: "High-resolution texture replacements.".into(),
            version: "3.1".into(),
            author: "Community".into(),
            enabled: false,
        },
    ]
}
```

- [ ] **Step 5: Replace `src-tauri/src/lib.rs`**

Full replacement:

```rust
pub mod database;

#[cfg(feature = "desktop")]
use std::sync::Mutex;

#[cfg(feature = "desktop")]
use database::{AppState, Database};

#[cfg(feature = "desktop")]
#[tauri::command]
fn load_state(database: tauri::State<'_, Mutex<Database>>) -> Result<AppState, String> {
    database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .load_state()
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn set_active_profile(
    profile_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .set_active_profile(&profile_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn sign_out(database: tauri::State<'_, Mutex<Database>>) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    database
        .sign_out()
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn queue_install(
    game_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .queue_install(&active_profile_id, &game_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
#[tauri::command]
fn toggle_mod(
    mod_id: String,
    database: tauri::State<'_, Mutex<Database>>,
) -> Result<AppState, String> {
    let database = database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let active_profile_id = database
        .load_state()
        .map_err(|error| error.to_string())?
        .active_profile_id
        .ok_or("not signed in".to_string())?;
    database
        .toggle_mod(&active_profile_id, &mod_id)
        .and_then(|_| database.load_state())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
            std::fs::create_dir_all(&app_data)
                .map_err(|error| format!("failed to create app data dir: {error}"))?;
            let database = Database::open(app_data.join("classicomp.sqlite3"))
                .map_err(|error| format!("failed to open database: {error}"))?;
            app.manage(Mutex::new(database));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            set_active_profile,
            sign_out,
            queue_install,
            toggle_mod
        ])
        .run(tauri::generate_context!())
        .expect("error while running Classicomp");
}
```

- [ ] **Step 6: Run the Rust tests**

Run: `npm run test:rust`
Expected: PASS (4 tests)

- [ ] **Step 7: Type-check the desktop command wrappers**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --features desktop`
Expected: compiles with no errors (first run may take several minutes while Tauri dependencies build; `src-tauri/target` already exists so they are likely cached).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/database.rs src-tauri/src/lib.rs src-tauri/tests/database.rs
git commit -m "feat: add mods, tags, and sign-out to the sqlite backend"
```

---

### Task 5: Extract views from `App.tsx` (pure move, no behavior change)

**Files:**
- Create: `src/ui/game-icon.tsx`
- Create: `src/ui/library-view.tsx`
- Create: `src/ui/catalog-view.tsx`
- Create: `src/ui/app-header.tsx`
- Modify: `src/App.tsx` (full replacement, slims to composition + the not-yet-moved pieces)

**Interfaces:**
- Consumes: nothing new.
- Produces (same code, new homes — later tasks edit these files):
  - `GameIcon({ game }: { game: Game })` from `src/ui/game-icon.tsx`
  - `LibraryView({ entries, games, selectedGameId, hasCloudProvider, onSelectGame, onQueueInstall }: LibraryViewProps)` from `src/ui/library-view.tsx` (renders sidebar + detail two-column layout; computes the selected game internally)
  - `CatalogView({ games, library, onQueueInstall }: CatalogViewProps)` from `src/ui/catalog-view.tsx`
  - `AppHeader({ activeProfile, downloadsCount, profiles, route, onActivateProfile, onChangeRoute }: HeaderProps)` from `src/ui/app-header.tsx` (unchanged props, still has the Downloads tab; Task 6 rewrites it)
- `DownloadsView` and `StatusStrip` stay in `App.tsx` until Task 7 deletes them.

- [ ] **Step 1: Create `src/ui/game-icon.tsx`**

```tsx
import type { Game } from '../domain/types';

export function GameIcon({ game }: { game: Game }) {
  return (
    <span className="game-icon">
      {game.iconUrl ? (
        <img
          alt=""
          src={game.iconUrl}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <span aria-hidden="true">{game.title.charAt(0)}</span>
    </span>
  );
}
```

- [ ] **Step 2: Create `src/ui/library-view.tsx`**

Move the sidebar, state icon, and game detail here, wrapped in a `LibraryView`:

```tsx
import {
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  Search,
} from 'lucide-react';
import { useMemo } from 'react';
import type { Game, LibraryEntry } from '../domain/types';
import { GameIcon } from './game-icon';

interface LibraryViewProps {
  entries: LibraryEntry[];
  games: Game[];
  selectedGameId: string;
  hasCloudProvider: boolean;
  onSelectGame(gameId: string): void;
  onQueueInstall(gameId: string): void;
}

export function LibraryView({
  entries,
  games,
  selectedGameId,
  hasCloudProvider,
  onSelectGame,
  onQueueInstall,
}: LibraryViewProps) {
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? games[0];
  return (
    <>
      <LibrarySidebar
        entries={entries}
        games={games}
        selectedGameId={selectedGame.id}
        onSelectGame={onSelectGame}
      />
      <GameDetail
        entry={entries.find((item) => item.gameId === selectedGame.id)}
        game={selectedGame}
        hasCloudProvider={hasCloudProvider}
        onQueueInstall={onQueueInstall}
      />
    </>
  );
}

interface LibrarySidebarProps {
  entries: LibraryEntry[];
  games: Game[];
  selectedGameId: string;
  onSelectGame(gameId: string): void;
}

function LibrarySidebar({ entries, games, selectedGameId, onSelectGame }: LibrarySidebarProps) {
  const libraryRows = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          game: games.find((game) => game.id === entry.gameId),
        }))
        .filter((row): row is { entry: LibraryEntry; game: Game } => Boolean(row.game)),
    [entries, games],
  );
  const installedRows = libraryRows.filter(({ entry }) => entry.installState === 'installed');
  const availableRows = libraryRows.filter(({ entry }) => entry.installState !== 'installed');

  function renderRows(rows: typeof libraryRows) {
    return rows.map(({ entry, game }) => (
      <button
        aria-current={selectedGameId === game.id ? 'page' : undefined}
        className="library-row"
        key={game.id}
        type="button"
        onClick={() => onSelectGame(game.id)}
      >
        <GameIcon game={game} />
        <span>{game.title}</span>
        <LibraryStateIcon state={entry.installState} />
      </button>
    ));
  }

  return (
    <aside className="library-rail" aria-label="Library games">
      <label className="search-field">
        <Search aria-hidden="true" size={15} />
        <input aria-label="Search library" placeholder="Search" type="search" />
      </label>
      <div className="library-list">
        {installedRows.length > 0 ? (
          <section aria-labelledby="installed-games-heading">
            <h2 id="installed-games-heading">Installed</h2>
            {renderRows(installedRows)}
          </section>
        ) : null}
        <section aria-labelledby="not-installed-games-heading">
          <h2 id="not-installed-games-heading">Not installed</h2>
          {renderRows(availableRows)}
        </section>
      </div>
      <div className="library-count">{libraryRows.length} games</div>
    </aside>
  );
}

function LibraryStateIcon({ state }: { state: LibraryEntry['installState'] }) {
  if (state === 'installed') return <Check aria-label="Installed" size={12} />;
  if (state === 'queued' || state === 'downloading') {
    return <Clock3 aria-label={state === 'queued' ? 'Queued' : 'Downloading'} size={12} />;
  }
  return <Download aria-label="Available to install" size={12} />;
}

interface GameDetailProps {
  entry?: LibraryEntry;
  game: Game;
  hasCloudProvider: boolean;
  onQueueInstall(gameId: string): void;
}

function GameDetail({ entry, game, hasCloudProvider, onQueueInstall }: GameDetailProps) {
  const installState = entry?.installState ?? 'available';
  const actionLabel =
    installState === 'installed' ? 'Play' : installState === 'queued' ? 'Queued' : 'Queue install';

  return (
    <article className="game-detail">
      <div className="game-hero">
        {game.artworkUrl ? (
          <img
            alt=""
            src={game.artworkUrl}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
        <div className="game-hero-copy">
          <h2>{game.title}</h2>
          <p>{game.summary}</p>
        </div>
      </div>

      <div className="action-bar">
        <button
          className="primary-action"
          disabled={installState === 'queued'}
          type="button"
          onClick={() => onQueueInstall(game.id)}
        >
          {installState === 'installed' ? null : <Download aria-hidden="true" size={17} />}
          {actionLabel}
        </button>
        <span>Version {game.version}</span>
        <span>{game.runtime}</span>
        <a href={game.upstreamUrl} rel="noreferrer" target="_blank">
          Upstream <ExternalLink aria-hidden="true" size={11} />
        </a>
        <span className="cloud-mini-status">
          {hasCloudProvider ? <Cloud aria-hidden="true" size={13} /> : <CloudOff aria-hidden="true" size={13} />}
          {hasCloudProvider ? 'Provider configured' : 'Local only'}
        </span>
      </div>

      <div className="detail-layout">
        <section className="about-panel">
          <h3>About</h3>
          <p>{game.description}</p>
          {game.executablePath ? null : (
            <p className="recipe-note">A verified install recipe is not available yet.</p>
          )}
        </section>
        <aside className="metadata-panel" aria-label="Game information">
          <h3>Game information</h3>
          <dl>
            <div><dt>Install state</dt><dd>{installState === 'available' ? 'Not installed' : installState}</dd></div>
            <div><dt>Install path</dt><dd>{entry?.installPath ?? 'Not installed'}</dd></div>
            <div><dt>Executable</dt><dd>{game.executablePath ?? 'Not installed'}</dd></div>
            <div><dt>Version</dt><dd>{game.version}</dd></div>
            <div><dt>Runtime</dt><dd>{game.runtime}</dd></div>
            <div><dt>Play time</dt><dd>{entry?.playMinutes ? `${entry.playMinutes} min` : 'Never played'}</dd></div>
            <div><dt>Cloud saves</dt><dd>{hasCloudProvider ? 'Provider configured' : 'Local only'}</dd></div>
          </dl>
        </aside>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Create `src/ui/catalog-view.tsx`**

Move `CatalogView` as-is:

```tsx
import type { Game, LibraryEntry } from '../domain/types';
import { GameIcon } from './game-icon';

interface CatalogViewProps {
  games: Game[];
  library: LibraryEntry[];
  onQueueInstall(gameId: string): void;
}

export function CatalogView({ games, library, onQueueInstall }: CatalogViewProps) {
  return (
    <section className="catalog-view" aria-labelledby="catalog-heading">
      <div className="view-heading">
        <h2 id="catalog-heading">Catalog</h2>
      </div>
      <div className="catalog-table">
        {games.map((game) => {
          const installState =
            library.find((entry) => entry.gameId === game.id)?.installState ?? 'available';
          return (
            <article className="catalog-row" key={game.id}>
              <GameIcon game={game} />
              <div>
                <h3>{game.title}</h3>
                <p>{game.summary}</p>
              </div>
              <span>{game.runtime}</span>
              <button
                aria-label={`Queue ${game.title} install`}
                disabled={installState === 'queued'}
                type="button"
                onClick={() => onQueueInstall(game.id)}
              >
                {installState === 'queued' ? 'Queued' : 'Queue'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `src/ui/app-header.tsx`**

Move `AppHeader` as-is (still has the Downloads tab and profile `<select>` — Task 6 rewrites it):

```tsx
import { UserRound } from 'lucide-react';
import type { AppRoute, Profile } from '../domain/types';

interface HeaderProps {
  activeProfile: Profile;
  downloadsCount: number;
  profiles: Profile[];
  route: AppRoute;
  onActivateProfile(profileId: string): void;
  onChangeRoute(route: AppRoute): void;
}

export function AppHeader({
  activeProfile,
  downloadsCount,
  profiles,
  route,
  onActivateProfile,
  onChangeRoute,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <h1>CLASSICOMP</h1>
      </div>

      <nav aria-label="Primary" className="primary-tabs" role="tablist">
        <button
          aria-selected={route === 'library'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('library')}
        >
          Library
        </button>
        <button
          aria-selected={route === 'catalog'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('catalog')}
        >
          Catalog
        </button>
        <button
          aria-selected={route === 'downloads'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('downloads')}
        >
          Downloads{downloadsCount > 0 ? ` (${downloadsCount})` : ''}
        </button>
      </nav>

      <label className="profile-menu">
        <span>
          <UserRound aria-hidden="true" size={15} />
          {activeProfile.avatarInitials}
        </span>
        <select
          aria-label="Active profile"
          value={activeProfile.id}
          onChange={(event) => onActivateProfile(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
```

- [ ] **Step 5: Replace `src/App.tsx`**

Composition root only, plus `DownloadsView`/`StatusStrip` until Task 7:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { seedState } from './data/seed';
import { reduceAppState, selectVisibleLibrary } from './domain/state';
import type { AppRoute, AppState, Game } from './domain/types';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';
import { AppHeader } from './ui/app-header';
import { CatalogView } from './ui/catalog-view';
import { GameIcon } from './ui/game-icon';
import { LibraryView } from './ui/library-view';

interface AppProps {
  bridge?: PlatformBridge;
}

export function App({ bridge }: AppProps) {
  const activeBridge = useMemo(
    () => bridge ?? createDefaultBridge(),
    [bridge],
  );
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let mounted = true;
    activeBridge.loadState().then((loaded) => {
      if (mounted) setState(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [activeBridge]);

  const viewState = state ?? seedState;
  const activeProfile =
    viewState.profiles.find((profile) => profile.id === viewState.activeProfileId) ??
    viewState.profiles[0];
  const activeLibrary = selectVisibleLibrary(viewState);
  const downloadsForProfile = viewState.downloads.filter(
    (download) => download.profileId === viewState.activeProfileId,
  );

  function changeRoute(route: AppRoute) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'route/change', route }));
  }

  function selectLibraryGame(gameId: string) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'game/select', gameId }));
  }

  async function activateProfile(profileId: string) {
    setState(await activeBridge.setActiveProfile(profileId));
  }

  async function queueInstall(gameId: string) {
    setState(await activeBridge.queueInstall(gameId));
  }

  return (
    <main className="app-shell">
      <AppHeader
        activeProfile={activeProfile}
        downloadsCount={downloadsForProfile.length}
        profiles={viewState.profiles}
        route={viewState.route}
        onActivateProfile={activateProfile}
        onChangeRoute={changeRoute}
      />

      <section className="app-body">
        {viewState.route === 'library' ? (
          <LibraryView
            entries={activeLibrary}
            games={viewState.games}
            selectedGameId={viewState.selectedGameId}
            hasCloudProvider={Boolean(viewState.cloudProvider)}
            onSelectGame={selectLibraryGame}
            onQueueInstall={queueInstall}
          />
        ) : null}

        {viewState.route === 'catalog' ? (
          <CatalogView
            games={viewState.games}
            library={activeLibrary}
            onQueueInstall={queueInstall}
          />
        ) : null}

        {viewState.route === 'downloads' ? (
          <DownloadsView downloads={downloadsForProfile} games={viewState.games} />
        ) : null}
      </section>

      <StatusStrip downloadsCount={downloadsForProfile.length} profileName={activeProfile.displayName} />
    </main>
  );
}

interface DownloadsViewProps {
  downloads: AppState['downloads'];
  games: Game[];
}

function DownloadsView({ downloads, games }: DownloadsViewProps) {
  return (
    <section className="downloads-view" aria-labelledby="downloads-heading">
      <div className="view-heading">
        <h2 id="downloads-heading">Downloads</h2>
      </div>
      {downloads.length === 0 ? (
        <p className="empty-state">Nothing queued.</p>
      ) : (
        <div className="download-list">
          {downloads.map((download) => {
            const game = games.find((item) => item.id === download.gameId);
            if (!game) return null;
            return (
              <article className="download-row" key={download.id}>
                <GameIcon game={game} />
                <div>
                  <h3>{game.title}</h3>
                  <p>Waiting for a verified install recipe</p>
                </div>
                <span>{download.state}</span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusStrip({ downloadsCount, profileName }: { downloadsCount: number; profileName: string }) {
  return (
    <footer className="status-strip" role="status">
      <span>{downloadsCount === 0 ? 'Ready' : `${downloadsCount} queued`}</span>
      <span className="status-profile">{profileName}</span>
    </footer>
  );
}
```

- [ ] **Step 6: Run the full vitest suite and the type check**

Run: `npm test`
Expected: PASS (behavior unchanged by the move)

Run: `npx tsc -b`
Expected: PASS (the extraction compiles cleanly; the legacy `'downloads'` route member is still in the union, so the remaining `=== 'downloads'` comparisons are valid)

- [ ] **Step 7: Commit**

```bash
git add src/ui src/App.tsx
git commit -m "refactor: extract library, catalog, and header views out of App"
```

---

### Task 6: Sign-in screen, account menu, and Steam-style header tabs

**Files:**
- Modify: `src/ui/app-header.tsx` (full replacement)
- Create: `src/ui/sign-in-view.tsx`
- Modify: `src/App.tsx` (full replacement)
- Test: `src/App.test.tsx` (full replacement)
- Modify: `src/styles/app.css`, `src/styles/responsive.css`

**Interfaces:**
- Consumes: `PlatformBridge.signOut()` (Task 3), `profile/signOut` reducer action (Task 1).
- Produces: `AppHeader({ activeProfile, profiles, route, onActivateProfile, onSignOut, onChangeRoute })` — note `downloadsCount` is gone and tabs are Library/Catalog/Mods. `SignInView({ profiles, onSignIn })`. `App` renders only `SignInView` when no profile matches `activeProfileId`.

- [ ] **Step 1: Replace the tests first**

Replace `src/App.test.tsx` entirely:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import * as appModule from './App';
import { createBrowserBridge } from './platform/browser-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('Classicomp desktop shell', () => {
  it('loads the library with its primary navigation and local-only save status', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    expect(await screen.findByRole('heading', { name: 'OpenRCT2' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Catalog' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Mods' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /Downloads/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Local only')[0]).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Ready');
  });

  it('uses dense launcher chrome instead of marketing labels and repeated state badges', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    expect(await screen.findByRole('heading', { name: 'OpenRCT2' })).toBeVisible();
    expect(screen.queryByText('Desktop client', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryAllByText(/^available$/i)).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Not installed' })).toBeVisible();
  });

  it('queues a catalog game and keeps the catalog route', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('tab', { name: 'Catalog' }));
    await user.click(screen.getByRole('button', { name: 'Queue DevilutionX install' }));

    expect(screen.getByRole('tab', { name: 'Catalog' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 queued');
    expect(JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}').downloads).toHaveLength(1);
  });

  it('signs out to the sign-in screen and back in as another profile', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('button', { name: /The Dictator/ }));
    await user.click(screen.getByRole('menuitem', { name: /Sign out/ }));

    expect(await screen.findByRole('heading', { name: 'Sign in to Classicomp' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Library' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Guest/ }));
    expect(await screen.findByRole('heading', { name: 'OpenRCT2' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Guest/ })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no Mods tab, no Sign out menuitem (the old profile `<select>` has no such role).

- [ ] **Step 3: Replace `src/ui/app-header.tsx`**

```tsx
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppRoute, Profile } from '../domain/types';

interface HeaderProps {
  activeProfile: Profile;
  profiles: Profile[];
  route: AppRoute;
  onActivateProfile(profileId: string): void;
  onSignOut(): void;
  onChangeRoute(route: AppRoute): void;
}

export function AppHeader({
  activeProfile,
  profiles,
  route,
  onActivateProfile,
  onSignOut,
  onChangeRoute,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <h1>CLASSICOMP</h1>
      </div>

      <nav aria-label="Primary" className="primary-tabs" role="tablist">
        <button
          aria-selected={route === 'library'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('library')}
        >
          Library
        </button>
        <button
          aria-selected={route === 'catalog'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('catalog')}
        >
          Catalog
        </button>
        <button
          aria-selected={route === 'mods'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('mods')}
        >
          Mods
        </button>
      </nav>

      <AccountMenu
        activeProfile={activeProfile}
        profiles={profiles}
        onActivateProfile={onActivateProfile}
        onSignOut={onSignOut}
      />
    </header>
  );
}

interface AccountMenuProps {
  activeProfile: Profile;
  profiles: Profile[];
  onActivateProfile(profileId: string): void;
  onSignOut(): void;
}

function AccountMenu({ activeProfile, profiles, onActivateProfile, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const otherProfiles = profiles.filter((profile) => profile.id !== activeProfile.id);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <UserRound aria-hidden="true" size={15} />
        {activeProfile.displayName}
        <ChevronDown aria-hidden="true" size={13} />
      </button>
      {open ? (
        <div className="account-dropdown" role="menu">
          {otherProfiles.length > 0 ? (
            <>
              <h2>Switch account</h2>
              {otherProfiles.map((profile) => (
                <button
                  key={profile.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onActivateProfile(profile.id);
                  }}
                >
                  <span aria-hidden="true">{profile.avatarInitials}</span>
                  {profile.displayName}
                </button>
              ))}
              <hr />
            </>
          ) : null}
          <button
            className="sign-out-item"
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut aria-hidden="true" size={13} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/ui/sign-in-view.tsx`**

```tsx
import type { Profile } from '../domain/types';

interface SignInViewProps {
  profiles: Profile[];
  onSignIn(profileId: string): void;
}

export function SignInView({ profiles, onSignIn }: SignInViewProps) {
  return (
    <main className="sign-in-view">
      <section className="sign-in-card" aria-labelledby="sign-in-heading">
        <h1 id="sign-in-heading">Sign in to Classicomp</h1>
        <div className="sign-in-accounts">
          {profiles.map((profile) => (
            <button
              className="sign-in-account"
              key={profile.id}
              type="button"
              onClick={() => onSignIn(profile.id)}
            >
              <span aria-hidden="true" className="sign-in-avatar">
                {profile.avatarInitials}
              </span>
              {profile.displayName}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Replace `src/App.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { seedState } from './data/seed';
import { reduceAppState, selectVisibleLibrary } from './domain/state';
import type { AppRoute, AppState, Game } from './domain/types';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';
import { AppHeader } from './ui/app-header';
import { CatalogView } from './ui/catalog-view';
import { GameIcon } from './ui/game-icon';
import { LibraryView } from './ui/library-view';
import { SignInView } from './ui/sign-in-view';

interface AppProps {
  bridge?: PlatformBridge;
}

export function App({ bridge }: AppProps) {
  const activeBridge = useMemo(
    () => bridge ?? createDefaultBridge(),
    [bridge],
  );
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let mounted = true;
    activeBridge.loadState().then((loaded) => {
      if (mounted) setState(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [activeBridge]);

  const viewState = state ?? seedState;
  const activeProfile = viewState.profiles.find(
    (profile) => profile.id === viewState.activeProfileId,
  );

  function changeRoute(route: AppRoute) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'route/change', route }));
  }

  function selectLibraryGame(gameId: string) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'game/select', gameId }));
  }

  async function activateProfile(profileId: string) {
    setState(await activeBridge.setActiveProfile(profileId));
  }

  async function signOut() {
    setState(await activeBridge.signOut());
  }

  async function queueInstall(gameId: string) {
    setState(await activeBridge.queueInstall(gameId));
  }

  if (!activeProfile) {
    return <SignInView profiles={viewState.profiles} onSignIn={activateProfile} />;
  }

  const activeLibrary = selectVisibleLibrary(viewState);
  const downloadsForProfile = viewState.downloads.filter(
    (download) => download.profileId === viewState.activeProfileId,
  );

  return (
    <main className="app-shell">
      <AppHeader
        activeProfile={activeProfile}
        profiles={viewState.profiles}
        route={viewState.route}
        onActivateProfile={activateProfile}
        onChangeRoute={changeRoute}
        onSignOut={signOut}
      />

      <section className="app-body">
        {viewState.route === 'library' ? (
          <LibraryView
            entries={activeLibrary}
            games={viewState.games}
            selectedGameId={viewState.selectedGameId}
            hasCloudProvider={Boolean(viewState.cloudProvider)}
            onSelectGame={selectLibraryGame}
            onQueueInstall={queueInstall}
          />
        ) : null}

        {viewState.route === 'catalog' ? (
          <CatalogView
            games={viewState.games}
            library={activeLibrary}
            onQueueInstall={queueInstall}
          />
        ) : null}

        {viewState.route === 'downloads' ? (
          <DownloadsView downloads={downloadsForProfile} games={viewState.games} />
        ) : null}
      </section>

      <StatusStrip downloadsCount={downloadsForProfile.length} profileName={activeProfile.displayName} />
    </main>
  );
}

interface DownloadsViewProps {
  downloads: AppState['downloads'];
  games: Game[];
}

function DownloadsView({ downloads, games }: DownloadsViewProps) {
  return (
    <section className="downloads-view" aria-labelledby="downloads-heading">
      <div className="view-heading">
        <h2 id="downloads-heading">Downloads</h2>
      </div>
      {downloads.length === 0 ? (
        <p className="empty-state">Nothing queued.</p>
      ) : (
        <div className="download-list">
          {downloads.map((download) => {
            const game = games.find((item) => item.id === download.gameId);
            if (!game) return null;
            return (
              <article className="download-row" key={download.id}>
                <GameIcon game={game} />
                <div>
                  <h3>{game.title}</h3>
                  <p>Waiting for a verified install recipe</p>
                </div>
                <span>{download.state}</span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusStrip({ downloadsCount, profileName }: { downloadsCount: number; profileName: string }) {
  return (
    <footer className="status-strip" role="status">
      <span>{downloadsCount === 0 ? 'Ready' : `${downloadsCount} queued`}</span>
      <span className="status-profile">{profileName}</span>
    </footer>
  );
}
```

- [ ] **Step 6: Update the styles**

In `src/styles/app.css`, replace the `.primary-tabs button` rule with:

```css
.primary-tabs button {
  padding: 0 14px;
  border: 0;
  border-inline: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: .06em;
  text-transform: uppercase;
  cursor: pointer;
}
```

Delete the `.profile-menu`, `.profile-menu span`, and `.profile-menu select` rules, and add in their place:

```css
.account-menu {
  position: relative;
  display: flex;
  align-items: center;
  justify-self: end;
  padding-right: 12px;
}

.account-menu > button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.account-menu > button:hover {
  border-color: var(--surface-3);
  color: var(--text-bright);
}

.account-dropdown {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 12px;
  min-width: 210px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface-1);
  box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
}

.account-dropdown h2 {
  margin: 4px 8px 6px;
  color: var(--dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.account-dropdown button[role="menuitem"] {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.account-dropdown button[role="menuitem"]:hover {
  background: var(--surface-hover);
  color: var(--text-bright);
}

.account-dropdown hr {
  margin: 6px 4px;
  border: 0;
  border-top: 1px solid var(--line-soft);
}

.account-dropdown .sign-out-item {
  color: var(--red);
}
```

Append to the end of `src/styles/app.css`:

```css
.sign-in-view {
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at 30% 20%, #1d2f45 0%, var(--surface-0) 65%);
}

.sign-in-card {
  width: 340px;
  padding: 28px 24px 24px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface-1);
  box-shadow: 0 12px 40px rgb(0 0 0 / 50%);
}

.sign-in-card h1 {
  margin: 0 0 18px;
  color: var(--text-bright);
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}

.sign-in-accounts {
  display: grid;
  gap: 8px;
}

.sign-in-account {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.sign-in-account:hover {
  border-color: var(--blue);
  color: var(--text-bright);
}

.sign-in-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 2px;
  background: var(--surface-3);
  color: var(--text-bright);
  font-weight: 700;
}
```

In `src/styles/responsive.css`, inside the `max-width: 960px` block: replace `.profile-menu { padding-right: 8px; }` with `.account-menu { padding-right: 8px; }`, and delete the `.profile-menu span { display: none; }` rule.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/ui/app-header.tsx src/ui/sign-in-view.tsx src/App.tsx src/App.test.tsx src/styles/app.css src/styles/responsive.css
git commit -m "feat: add sign-in screen and steam-style account menu"
```

---

### Task 7: Downloads bar at the bottom

**Files:**
- Create: `src/ui/downloads-bar.tsx`
- Modify: `src/App.tsx` (full replacement — drops `DownloadsView`, `StatusStrip`, and the `downloads` route branch)
- Modify: `src/domain/types.ts` (one line — remove the legacy route)
- Test: `src/App.test.tsx` (two targeted edits)
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `PlatformBridge.queueInstall` (Task 3), `Download` type (Task 1).
- Produces: `DownloadsBar({ downloads, games, open, onToggle }: { downloads: Download[]; games: Game[]; open: boolean; onToggle(open: boolean): void })`. `AppRoute` is now exactly `'library' | 'catalog' | 'mods'`. Queueing an install opens the panel.

- [ ] **Step 1: Update the failing tests first**

In `src/App.test.tsx`:

a) Add `within` to the Testing Library import:

```tsx
import { render, screen, within } from '@testing-library/react';
```

b) In the first test, replace the last assertion:

```tsx
    expect(screen.getByRole('status')).toHaveTextContent('Ready');
```

with:

```tsx
    expect(screen.getByRole('status')).toHaveTextContent('No active downloads');
```

c) Replace the whole `it('queues a catalog game and keeps the catalog route', ...)` block with:

```tsx
  it('queues a catalog game and shows it in the downloads bar', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('tab', { name: 'Catalog' }));
    await user.click(screen.getByRole('button', { name: 'Queue DevilutionX install' }));

    expect(screen.getByRole('tab', { name: 'Catalog' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Downloads (1)');
    const queue = screen.getByLabelText('Download queue');
    expect(queue).toBeVisible();
    expect(within(queue).getByText('DevilutionX')).toBeVisible();
    expect(JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}').downloads).toHaveLength(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — status still says "Ready", no "Download queue" region.

- [ ] **Step 3: Remove the legacy route from `src/domain/types.ts`**

Replace:

```ts
export type AppRoute = 'library' | 'catalog' | 'mods' | 'downloads'; // 'downloads' is a legacy route removed once the downloads bar lands
```

with:

```ts
export type AppRoute = 'library' | 'catalog' | 'mods';
```

- [ ] **Step 4: Create `src/ui/downloads-bar.tsx`**

```tsx
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Download, Game } from '../domain/types';
import { GameIcon } from './game-icon';

interface DownloadsBarProps {
  downloads: Download[];
  games: Game[];
  open: boolean;
  onToggle(open: boolean): void;
}

export function DownloadsBar({ downloads, games, open, onToggle }: DownloadsBarProps) {
  const current = downloads[0];
  const currentGame = current
    ? games.find((game) => game.id === current.gameId)
    : undefined;

  return (
    <footer className="downloads-area">
      {open && downloads.length > 0 ? (
        <div aria-label="Download queue" className="downloads-panel">
          <div className="download-list">
            {downloads.map((download) => {
              const game = games.find((item) => item.id === download.gameId);
              if (!game) return null;
              return (
                <article className="download-row" key={download.id}>
                  <GameIcon game={game} />
                  <div>
                    <h3>{game.title}</h3>
                    <p>Waiting for a verified install recipe</p>
                  </div>
                  <span>{download.state}</span>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="downloads-bar" role="status">
        <span className="downloads-label">
          Downloads{downloads.length > 0 ? ` (${downloads.length})` : ''}
        </span>
        {current && currentGame ? (
          <>
            <span className="downloads-current">{currentGame.title}</span>
            <span aria-hidden="true" className="downloads-progress">
              <span style={{ width: `${current.progress}%` }} />
            </span>
            <span className="downloads-state">{current.state}</span>
            <button
              aria-expanded={open}
              className="downloads-toggle"
              type="button"
              onClick={() => onToggle(!open)}
            >
              {open ? (
                <ChevronDown aria-hidden="true" size={13} />
              ) : (
                <ChevronUp aria-hidden="true" size={13} />
              )}
              {open ? 'Hide queue' : 'View queue'}
            </button>
          </>
        ) : (
          <span className="downloads-empty">No active downloads</span>
        )}
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Replace `src/App.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { seedState } from './data/seed';
import { reduceAppState, selectVisibleLibrary } from './domain/state';
import type { AppRoute, AppState } from './domain/types';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';
import { AppHeader } from './ui/app-header';
import { CatalogView } from './ui/catalog-view';
import { DownloadsBar } from './ui/downloads-bar';
import { LibraryView } from './ui/library-view';
import { SignInView } from './ui/sign-in-view';

interface AppProps {
  bridge?: PlatformBridge;
}

export function App({ bridge }: AppProps) {
  const activeBridge = useMemo(
    () => bridge ?? createDefaultBridge(),
    [bridge],
  );
  const [state, setState] = useState<AppState | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    activeBridge.loadState().then((loaded) => {
      if (mounted) setState(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [activeBridge]);

  const viewState = state ?? seedState;
  const activeProfile = viewState.profiles.find(
    (profile) => profile.id === viewState.activeProfileId,
  );

  function changeRoute(route: AppRoute) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'route/change', route }));
  }

  function selectLibraryGame(gameId: string) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'game/select', gameId }));
  }

  async function activateProfile(profileId: string) {
    setState(await activeBridge.setActiveProfile(profileId));
  }

  async function signOut() {
    setDownloadsOpen(false);
    setState(await activeBridge.signOut());
  }

  async function queueInstall(gameId: string) {
    setState(await activeBridge.queueInstall(gameId));
    setDownloadsOpen(true);
  }

  if (!activeProfile) {
    return <SignInView profiles={viewState.profiles} onSignIn={activateProfile} />;
  }

  const activeLibrary = selectVisibleLibrary(viewState);
  const downloadsForProfile = viewState.downloads.filter(
    (download) => download.profileId === viewState.activeProfileId,
  );

  return (
    <main className="app-shell">
      <AppHeader
        activeProfile={activeProfile}
        profiles={viewState.profiles}
        route={viewState.route}
        onActivateProfile={activateProfile}
        onChangeRoute={changeRoute}
        onSignOut={signOut}
      />

      <section className="app-body">
        {viewState.route === 'library' ? (
          <LibraryView
            entries={activeLibrary}
            games={viewState.games}
            selectedGameId={viewState.selectedGameId}
            hasCloudProvider={Boolean(viewState.cloudProvider)}
            onSelectGame={selectLibraryGame}
            onQueueInstall={queueInstall}
          />
        ) : null}

        {viewState.route === 'catalog' ? (
          <CatalogView
            games={viewState.games}
            library={activeLibrary}
            onQueueInstall={queueInstall}
          />
        ) : null}
      </section>

      <DownloadsBar
        downloads={downloadsForProfile}
        games={viewState.games}
        open={downloadsOpen}
        onToggle={setDownloadsOpen}
      />
    </main>
  );
}
```

- [ ] **Step 6: Update the styles**

In `src/styles/app.css`:

a) Change the `.app-shell` grid rows from `grid-template-rows: 40px minmax(0, 1fr) 24px;` to:

```css
  grid-template-rows: 40px minmax(0, 1fr) 36px;
```

b) Change the shared rule `.catalog-view,\n.downloads-view {` to just `.catalog-view {`.

c) Delete the `.status-strip` and `.status-strip .status-profile` rules.

d) Append:

```css
.downloads-area {
  position: relative;
}

.downloads-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  height: 36px;
  padding: 0 10px;
  border-top: 1px solid var(--line);
  background: #10141b;
  color: var(--dim);
  font-size: 11px;
}

.downloads-label {
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.downloads-current {
  color: var(--text);
}

.downloads-progress {
  width: 140px;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: #0b0f16;
}

.downloads-progress > span {
  display: block;
  height: 100%;
  background: var(--blue);
  transition: width .2s;
}

.downloads-state {
  text-transform: capitalize;
}

.downloads-toggle {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  margin-left: auto;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: var(--blue);
  font-size: 11px;
  cursor: pointer;
}

.downloads-toggle:hover {
  color: var(--text-bright);
}

.downloads-panel {
  position: absolute;
  z-index: 10;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 42vh;
  overflow-y: auto;
  border-top: 1px solid var(--line);
  background: var(--surface-1);
  box-shadow: 0 -8px 24px rgb(0 0 0 / 35%);
}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b`
Expected: PASS (this is the task where the last `'downloads'` references disappear)

- [ ] **Step 8: Commit**

```bash
git add src/ui/downloads-bar.tsx src/App.tsx src/domain/types.ts src/App.test.tsx src/styles/app.css
git commit -m "feat: move downloads into a bottom bar with an expandable queue"
```

---

### Task 8: Catalog filter bar

**Files:**
- Modify: `src/ui/catalog-view.tsx` (full replacement)
- Test: `src/App.test.tsx` (append one test)
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `filterCatalog`, `collectTags`, `collectRuntimes`, `EMPTY_CATALOG_FILTERS`, `CatalogFilters` from `src/domain/catalog.ts` (Task 2).
- Produces: `CatalogView` keeps the same props (`games`, `library`, `onQueueInstall`); filter state is internal.

- [ ] **Step 1: Add the failing test**

Append to the `describe` block in `src/App.test.tsx`:

```tsx
  it('filters the catalog by search text and tag chips', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('tab', { name: 'Catalog' }));

    await user.type(screen.getByRole('searchbox', { name: 'Search catalog' }), 'diablo');
    expect(screen.getByText('DevilutionX')).toBeVisible();
    expect(screen.queryByText('OpenMW')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search catalog' }));
    await user.click(screen.getByRole('button', { name: 'RPG' }));
    expect(screen.getByText('DevilutionX')).toBeVisible();
    expect(screen.getByText('OpenMW')).toBeVisible();
    expect(screen.queryByText('OpenTTD')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no "Search catalog" searchbox exists yet.

- [ ] **Step 3: Replace `src/ui/catalog-view.tsx`**

```tsx
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  EMPTY_CATALOG_FILTERS,
  collectRuntimes,
  collectTags,
  filterCatalog,
} from '../domain/catalog';
import type { CatalogFilters } from '../domain/catalog';
import type { Game, LibraryEntry } from '../domain/types';
import { GameIcon } from './game-icon';

interface CatalogViewProps {
  games: Game[];
  library: LibraryEntry[];
  onQueueInstall(gameId: string): void;
}

export function CatalogView({ games, library, onQueueInstall }: CatalogViewProps) {
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_CATALOG_FILTERS);
  const availableTags = useMemo(() => collectTags(games), [games]);
  const availableRuntimes = useMemo(() => collectRuntimes(games), [games]);
  const visibleGames = useMemo(
    () => filterCatalog(games, library, filters),
    [games, library, filters],
  );

  function toggleTag(tag: string) {
    setFilters((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }

  return (
    <section className="catalog-view" aria-labelledby="catalog-heading">
      <div className="view-heading">
        <h2 id="catalog-heading">Catalog</h2>
      </div>

      <div className="catalog-filters">
        <label className="search-field catalog-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="Search catalog"
            placeholder="Search catalog"
            type="search"
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
          />
        </label>
        <div aria-label="Filter by tag" className="tag-chips" role="group">
          {availableTags.map((tag) => (
            <button
              aria-pressed={filters.tags.includes(tag)}
              className="tag-chip"
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by install state"
          value={filters.installState}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              installState: event.target.value as CatalogFilters['installState'],
            }))
          }
        >
          <option value="all">All games</option>
          <option value="installed">Installed</option>
          <option value="not-installed">Not installed</option>
        </select>
        <select
          aria-label="Filter by runtime"
          value={filters.runtime}
          onChange={(event) =>
            setFilters((current) => ({ ...current, runtime: event.target.value }))
          }
        >
          <option value="all">All runtimes</option>
          {availableRuntimes.map((runtime) => (
            <option key={runtime} value={runtime}>
              {runtime}
            </option>
          ))}
        </select>
      </div>

      {visibleGames.length === 0 ? (
        <p className="empty-state">No games match these filters.</p>
      ) : (
        <div className="catalog-table">
          {visibleGames.map((game) => {
            const installState =
              library.find((entry) => entry.gameId === game.id)?.installState ?? 'available';
            return (
              <article className="catalog-row" key={game.id}>
                <GameIcon game={game} />
                <div>
                  <h3>{game.title}</h3>
                  <p>{game.summary}</p>
                </div>
                <span>{game.runtime}</span>
                <button
                  aria-label={`Queue ${game.title} install`}
                  disabled={installState === 'queued'}
                  type="button"
                  onClick={() => onQueueInstall(game.id)}
                >
                  {installState === 'queued' ? 'Queued' : 'Queue'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Add the filter bar styles**

Append to `src/styles/app.css`:

```css
.catalog-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.catalog-filters .catalog-search {
  width: 220px;
  margin: 0;
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  padding: 3px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-1);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}

.tag-chip:hover {
  border-color: var(--surface-3);
  color: var(--text-bright);
}

.tag-chip[aria-pressed="true"] {
  border-color: var(--blue);
  background: var(--blue);
  color: #0b0f16;
}

.catalog-filters select {
  height: 26px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/catalog-view.tsx src/App.test.tsx src/styles/app.css
git commit -m "feat: add search, tag, and state filters to the catalog"
```

---

### Task 9: Mods view

**Files:**
- Create: `src/ui/mods-view.tsx`
- Modify: `src/App.tsx` (three targeted edits)
- Test: `src/App.test.tsx` (append one test)
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `selectVisibleMods` (Task 1), `PlatformBridge.toggleMod` (Task 3).
- Produces: `ModsView({ games, mods, onToggleMod }: { games: Game[]; mods: Mod[]; onToggleMod(modId: string): void })`. Mod rows use `role="switch"` toggles with accessible names `Toggle <mod name>`.

- [ ] **Step 1: Add the failing test**

Append to the `describe` block in `src/App.test.tsx`:

```tsx
  it('shows per-game mods and toggles them for the active profile', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('tab', { name: 'Mods' }));

    expect(await screen.findByText('Tamriel Rebuilt')).toBeVisible();
    const toggle = screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);
    expect(screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    const persisted = JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}') as {
      mods: Record<string, Array<{ id: string; enabled: boolean }>>;
    };
    expect(
      persisted.mods.owner?.find((mod) => mod.id === 'mod-openmw-tamriel-rebuilt')?.enabled,
    ).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — clicking the Mods tab renders nothing (no route branch yet).

- [ ] **Step 3: Create `src/ui/mods-view.tsx`**

```tsx
import type { Game, Mod } from '../domain/types';
import { GameIcon } from './game-icon';

interface ModsViewProps {
  games: Game[];
  mods: Mod[];
  onToggleMod(modId: string): void;
}

export function ModsView({ games, mods, onToggleMod }: ModsViewProps) {
  const sections = games
    .map((game) => ({ game, gameMods: mods.filter((mod) => mod.gameId === game.id) }))
    .filter((section) => section.gameMods.length > 0);

  return (
    <section className="mods-view" aria-labelledby="mods-heading">
      <div className="view-heading">
        <h2 id="mods-heading">Mods</h2>
      </div>
      {sections.map(({ game, gameMods }) => (
        <section className="mods-game" key={game.id} aria-labelledby={`mods-${game.id}`}>
          <h3 id={`mods-${game.id}`}>
            <GameIcon game={game} />
            {game.title}
          </h3>
          <div className="mods-table">
            {gameMods.map((mod) => (
              <article className="mod-row" key={mod.id}>
                <div>
                  <h4>{mod.name}</h4>
                  <p>{mod.summary}</p>
                </div>
                <span>{mod.version}</span>
                <span>{mod.author}</span>
                <button
                  aria-checked={mod.enabled}
                  aria-label={`Toggle ${mod.name}`}
                  className="mod-toggle"
                  role="switch"
                  type="button"
                  onClick={() => onToggleMod(mod.id)}
                >
                  <span className="mod-toggle-knob" />
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Wire the Mods view into `src/App.tsx`**

Three edits:

a) Add `selectVisibleMods` to the state import:

```ts
import { reduceAppState, selectVisibleLibrary, selectVisibleMods } from './domain/state';
```

b) Add the view import below the `LibraryView` import:

```ts
import { ModsView } from './ui/mods-view';
```

c) Add the toggle handler after `queueInstall`:

```tsx
  async function toggleMod(modId: string) {
    setState(await activeBridge.toggleMod(modId));
  }
```

d) Add the visible-mods derivation after `activeLibrary`:

```tsx
  const activeMods = selectVisibleMods(viewState);
```

e) Add the route branch after the catalog branch:

```tsx
        {viewState.route === 'mods' ? (
          <ModsView games={viewState.games} mods={activeMods} onToggleMod={toggleMod} />
        ) : null}
```

- [ ] **Step 5: Add the mods styles**

In `src/styles/app.css`, change `.catalog-view {` back to a shared rule: `.catalog-view,\n.mods-view {`. Then append:

```css
.mods-game {
  margin-bottom: 18px;
}

.mods-game > h3 {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0 0 8px;
  color: var(--text-bright);
  font-size: 15px;
}

.mods-table {
  border: 1px solid var(--line);
  background: var(--surface-1);
}

.mod-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px 170px 40px;
  gap: 12px;
  align-items: center;
  min-height: 52px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}

.mod-row:last-child {
  border-bottom: 0;
}

.mod-row h4 {
  margin: 0;
  color: var(--text-bright);
  font-size: 13px;
}

.mod-row p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.mod-row > span {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mod-toggle {
  position: relative;
  width: 34px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--surface-3);
  cursor: pointer;
}

.mod-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text);
  transition: transform .15s;
}

.mod-toggle[aria-checked="true"] {
  background: var(--green);
}

.mod-toggle[aria-checked="true"] .mod-toggle-knob {
  transform: translateX(16px);
  background: var(--text-bright);
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/mods-view.tsx src/App.tsx src/App.test.tsx src/styles/app.css
git commit -m "feat: add per-game mods tab with enable toggles"
```

---

### Task 10: Final verification and docs sweep

**Files:**
- Modify: `README.md` (only if it describes the old navigation — check first)

**Interfaces:**
- Consumes: everything above.
- Produces: a green `npm run test:all`.

- [ ] **Step 1: Check the README for stale navigation references**

Run: `grep -n -i "downloads\|tab\|catalog\|profile" README.md`
Expected: if any line describes the old Downloads tab, profile `<select>`, or the status strip, update that passage to describe: Library / Catalog / Mods tabs, the account menu with sign out, catalog filters, and the bottom downloads bar. If there are no such references, change nothing.

- [ ] **Step 2: Run the full verification**

Run: `npm run test:all`
Expected: PASS — vitest, `tsc -b && vite build`, and cargo tests all green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: align readme with steam-like navigation" 
```

(If the README needed no changes and there is nothing to commit, skip this step.)
