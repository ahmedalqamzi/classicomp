import { seedState } from '../data/seed';
import { reduceAppState } from '../domain/state';
import type { AppRoute, AppState, DownloadState, Game, TrackedProject, TrackedProjectUpdate } from '../domain/types';
import { DISCOVERED_TITLE_FIXES, NON_GAME_REPO_PATTERN } from './project-discovery';

const STORAGE_KEY = 'classicomp.app-state.v2';
const KNOWN_ROUTES: AppRoute[] = ['library', 'store', 'mods', 'roadmap'];

function cloneSeedState(): AppState {
  return structuredClone(seedState);
}

// The store is the app's main page, so unknown or legacy routes land there.
function sanitizeRoute(state: AppState): AppState {
  if (KNOWN_ROUTES.includes(state.route)) return state;
  return { ...state, route: 'store' };
}

// Reconciles state persisted by earlier versions: missing tracking fields are
// filled in, and a changed bundled catalog replaces the stored one (a fresh
// scan then repopulates it). Catalog replacement also drops the legacy
// auto-seeded 'available' library rows — accounts hold only games that were
// actually downloaded from the store.
// Fills in every field the current build dereferences, so a record written by
// an older version is repaired rather than thrown away. This is what makes the
// app safe to update: adding a field to TrackedProject must never cost the
// player their scan history, their discovered projects, or their library.
function repairProject(stored: TrackedProject): TrackedProject {
  const seed = seedProjectsById.get(stored.id);
  return {
    ...seed,
    ...stored,
    gameShortTitle:
      typeof stored.gameShortTitle === 'string'
        ? stored.gameShortTitle
        : (seed?.gameShortTitle ?? stored.gameTitle),
    description: stored.description ?? seed?.description ?? null,
    coverUrl: 'coverUrl' in stored ? stored.coverUrl : (seed?.coverUrl ?? null),
    coverAspect: 'coverAspect' in stored ? stored.coverAspect : null,
    // Every array the UI maps over must exist; a missing one used to crash
    // rendering, which is why the old code reset the whole catalogue.
    screenshots: Array.isArray(stored.screenshots) ? stored.screenshots : [],
    topics: Array.isArray(stored.topics) ? stored.topics : [],
    recentReleases: Array.isArray(stored.recentReleases) ? stored.recentReleases : [],
    downloadAssets: Array.isArray(stored.downloadAssets) ? stored.downloadAssets : [],
  } as TrackedProject;
}

function withCatalogDefaults(state: AppState): AppState {
  const stored = Array.isArray(state.trackedProjects) ? state.trackedProjects : [];

  const next: AppState = {
    ...state,
    games: withSeedGameIdentity(state.games),
    watchlists: state.watchlists ?? structuredClone(seedState.watchlists),
    releaseNotices: Array.isArray(state.releaseNotices) ? state.releaseNotices : [],
    trackingLastScanAt: state.trackingLastScanAt ?? null,
  };

  // Repair and merge, never reset. An earlier version replaced the whole
  // catalogue whenever a stored record was missing a field the new build
  // expected — which meant updating the app silently threw away every scan
  // result, every auto-discovered project, and days of rotation progress.
  // Records are now brought up to the current shape in place, and new bundled
  // projects are added alongside them.
  const storedIds = new Set(stored.map((project) => project.id));
  const missingSeed = seedState.trackedProjects.filter(
    (project) => !storedIds.has(project.id),
  );
  next.trackedProjects = [
    ...stored
      .filter((project) => !isNonGameDiscovery(project))
      .map(repairProject)
      .map(withSeedIdentity)
      .map(withDiscoveryFixes),
    ...structuredClone(missingSeed),
  ];

  // romPath and downloadedFile arrived after the first stored builds. Missing
  // is indistinguishable from "not set yet" for gating purposes, but
  // normalising here keeps the persisted shape matching the type instead of
  // relying on undefined reading as falsy everywhere downstream.
  next.libraries = Object.fromEntries(
    Object.entries(next.libraries ?? {}).map(([profileId, entries]) => [
      profileId,
      (entries ?? []).map((entry) => {
        // Builds before the install step wrote the downloaded artifact into
        // installPath. That field now means "the runnable thing installing
        // produced", which a merely-downloaded entry does not have — so move
        // the artifact across rather than leaving Play pointed at a zip.
        const legacyArtifact =
          entry.installState !== 'installed' && entry.installPath !== null
            ? entry.installPath
            : null;
        return {
          ...entry,
          installPath: legacyArtifact !== null ? null : (entry.installPath ?? null),
          downloadedFile: entry.downloadedFile ?? legacyArtifact,
          romPath: entry.romPath ?? null,
          installedVersion: entry.installedVersion ?? null,
        };
      }),
    ]),
  );
  return next;
}

const seedGamesById = new Map(seedState.games.map((game) => [game.id, game]));

// A library game is named for the GAME, never the build that runs it, and
// that naming is curation the bundled seed owns — a store built before the
// rename persisted "DevilutionX" where "Diablo" belongs. Install-owned
// fields (where it lives, how far it has been played) stay stored.
function withSeedGameIdentity(games: Game[] | undefined): Game[] {
  if (!Array.isArray(games)) return structuredClone(seedState.games);
  return games.map((stored) => {
    const seed = seedGamesById.get(stored.id);
    if (!seed) return stored;
    return {
      ...stored,
      title: seed.title,
      shortTitle: seed.shortTitle,
      summary: seed.summary,
      description: seed.description,
      artworkUrl: seed.artworkUrl,
      iconUrl: seed.iconUrl,
      upstreamUrl: seed.upstreamUrl,
      accent: seed.accent,
      tags: seed.tags,
    };
  });
}

// Discovery records from builds before the non-game filter existed (awesome
// lists, tooling collections) get dropped on load.
function isNonGameDiscovery(project: TrackedProject): boolean {
  return (
    project.id.startsWith('discovered-') && NON_GAME_REPO_PATTERN.test(project.projectName)
  );
}

// Discovered records stored by earlier builds keep their raw repo-name
// titles; the curated fixes retitle them so media lookups can find the game.
// Fix-supplied media (hand-verified IGDB art) fills any record still missing
// a cover or gallery — including ones retitled by an earlier build.
function withDiscoveryFixes(stored: TrackedProject): TrackedProject {
  const fix = DISCOVERED_TITLE_FIXES[stored.id];
  if (!fix) return stored;
  const retitled =
    stored.gameTitle === fix.gameTitle
      ? stored
      : {
          ...stored,
          gameTitle: fix.gameTitle,
          gameShortTitle: fix.gameShortTitle ?? fix.gameTitle,
          gameKey: slugifyTitle(fix.gameTitle),
          originalReleaseYear: fix.originalReleaseYear ?? stored.originalReleaseYear,
          // The old title matched nothing real; whatever media it accumulated
          // is wrong by construction.
          screenshots: [],
          coverUrl: null,
          coverAspect: null,
        };
  return {
    ...retitled,
    coverUrl: retitled.coverUrl ?? fix.coverUrl ?? null,
    coverAspect: retitled.coverUrl !== null ? retitled.coverAspect : null,
    screenshots:
      retitled.screenshots.length > 0 ? retitled.screenshots : (fix.screenshots ?? []),
  };
}

function slugifyTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const seedProjectsById = new Map(
  seedState.trackedProjects.map((project) => [project.id, project]),
);

// Identity and curation fields belong to the bundled catalog, so corrections
// in a new app version reach existing stored records; scan-owned fields
// (versions, activity, releases) keep their stored values. Screenshots are
// curation too: a re-curated seed gallery replaces stale baked shots while
// scan-earned captures survive.
function withSeedIdentity(stored: TrackedProject): TrackedProject {
  const seed = seedProjectsById.get(stored.id);
  if (!seed) return stored;
  return {
    ...stored,
    gameKey: seed.gameKey,
    gameTitle: seed.gameTitle,
    gameShortTitle: seed.gameShortTitle,
    gameId: seed.gameId,
    projectName: seed.projectName,
    projectType: seed.projectType,
    originalReleaseYear: seed.originalReleaseYear,
    originalPlatforms: seed.originalPlatforms,
    repositoryUrl: seed.repositoryUrl,
    screenshots: reconcileScreenshots(stored.screenshots, seed.screenshots),
    // A curated seed cover replaces whatever a scan guessed (wrong-game box
    // art sticks forever otherwise); scan-earned covers stay when the seed
    // has none.
    coverUrl: seed.coverUrl ?? stored.coverUrl,
    coverAspect: seed.coverUrl !== null ? seed.coverAspect : stored.coverAspect,
  };
}

// Seed-gallery refresh for stored records: the union of seed and stored,
// stably sorted by provenance quality — real console captures, then HD
// store galleries, then repo shots and other pulls — with video stills
// surviving only when nothing better exists. Deterministic and idempotent,
// so re-running on every load is safe.
const VIDEO_STILL = /i\.ytimg\.com|img\.youtube\.com/;

function screenshotTier(url: string): number {
  if (url.includes('libretro')) return 0;
  if (/steamstatic\.com|images\.igdb\.com/.test(url)) return 1;
  if (VIDEO_STILL.test(url)) return 3;
  return 2;
}

function reconcileScreenshots(stored: string[], seed: string[]): string[] {
  const merged = [...new Set([...seed, ...stored])];
  const quality = merged.filter((url) => screenshotTier(url) < 3);
  const pool = quality.length > 0 ? quality : merged;
  return pool
    .map((url, index) => [url, index] as const)
    .sort((a, b) => screenshotTier(a[0]) - screenshotTier(b[0]) || a[1] - b[1])
    .map(([url]) => url)
    .slice(0, 10);
}

// Older key names, newest first. A future version that bumps STORAGE_KEY adds
// the previous name here and inherits the player's library instead of greeting
// them with an empty app.
const LEGACY_STORAGE_KEYS = ['classicomp.app-state'];

// Keeps the last state written under a previous key, so a migration that goes
// wrong is recoverable by hand rather than being an unrecoverable data loss.
const BACKUP_KEY = 'classicomp.app-state.pre-migration';

function readState(storage: Storage): AppState {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return withCatalogDefaults(sanitizeRoute(JSON.parse(stored) as AppState));
    } catch {
      return cloneSeedState();
    }
  }

  // Nothing under the current key. Before falling back to a fresh seed — which
  // would look exactly like "the update deleted everything" — check whether an
  // earlier build stored it somewhere else.
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = storage.getItem(key);
    if (!legacy) continue;
    try {
      const migrated = withCatalogDefaults(sanitizeRoute(JSON.parse(legacy) as AppState));
      try {
        storage.setItem(BACKUP_KEY, legacy);
      } catch {
        // A full quota must not block the migration itself.
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      // Unreadable under this key; try the next one.
    }
  }

  return cloneSeedState();
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

    async queueInstall(gameId: string, game?: Game): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'install/queue',
        gameId,
        game,
      });
      return writeState(storage, next);
    },

    async toggleMod(modId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), { type: 'mod/toggle', modId });
      return writeState(storage, next);
    },

    async toggleWatch(gameKey: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'tracking/toggleWatch',
        gameKey,
      });
      return writeState(storage, next);
    },

    async applyTrackingUpdates(
      updates: TrackedProjectUpdate[],
      scannedAt: string,
    ): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'tracking/applyUpdates',
        updates,
        scannedAt,
      });
      return writeState(storage, next);
    },

    async addTrackedProjects(projects: TrackedProject[]): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'tracking/addProjects',
        projects,
      });
      return writeState(storage, next);
    },

    async dismissNotice(noticeId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'notices/dismiss',
        noticeId,
      });
      return writeState(storage, next);
    },

    async uninstallGame(gameId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'library/uninstall',
        gameId,
      });
      return writeState(storage, next);
    },

    async setGameRom(gameId: string, romPath: string | null): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'library/setRom',
        gameId,
        romPath,
      });
      return writeState(storage, next);
    },

    async setGameInstalled(
      gameId: string,
      launchTarget: string,
      installedVersion: string | null,
    ): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'library/setInstalled',
        gameId,
        launchTarget,
        installedVersion,
      });
      return writeState(storage, next);
    },

    async setDownloadState(
      downloadId: string,
      state: DownloadState,
      progress?: number,
      fileName?: string,
    ): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'download/setState',
        downloadId,
        state,
        progress,
        fileName,
      });
      return writeState(storage, next);
    },
  };
}
