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

  it('persists watch toggles across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.toggleWatch('star-fox-64');

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(state.watchlists.owner).toContain('star-fox-64');
    expect(state.watchlists.guest ?? []).not.toContain('star-fox-64');
  });

  it('backfills tracking data for state persisted before the tracker merge', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();

    const firstRun = createBrowserBridge(storage);
    const state = await firstRun.loadState();
    const {
      trackedProjects: _projects,
      watchlists: _watchlists,
      ...legacyState
    } = state;
    storage.setItem('classicomp.app-state.v2', JSON.stringify(legacyState));

    const migrated = await createBrowserBridge(storage).loadState();
    expect(migrated.trackedProjects.length).toBeGreaterThan(0);
    expect(migrated.watchlists.owner).toBeDefined();
  });

  it('persists applied tracking updates and the scan time across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.applyTrackingUpdates(
      [
        {
          id: 'zelda64-recompiled',
          latestVersion: '1.3.0',
          lastActivityAt: null,
          developmentState: null,
          downloadUrl: null,
          description: null,
          topics: null,
          screenshots: null,
          recentReleases: null,
          downloadAssets: null,
          coverUrl: null,
          coverAspect: null,
          coverChecked: false,
          checkedAt: '2026-08-14T12:00:00Z',
        },
      ],
      '2026-08-14T12:00:00Z',
    );

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    const project = state.trackedProjects.find(
      (candidate) => candidate.id === 'zelda64-recompiled',
    );
    expect(project?.latestVersion).toBe('1.3.0');
    expect(project?.lastActivityAt).toBeNull();
    expect(state.trackingLastScanAt).toBe('2026-08-14T12:00:00Z');
  });

  it('keeps auto-discovered projects across reloads instead of resetting to the seed', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);
    const seeded = await firstRun.loadState();
    const template = seeded.trackedProjects[0];

    await firstRun.addTrackedProjects([
      {
        ...template,
        id: 'discovered-owner-new-decomp',
        gameKey: 'new-game',
        gameTitle: 'New Game',
        gameShortTitle: 'New Game',
        gameId: null,
        repositoryUrl: 'https://github.com/owner/new-decomp',
      },
    ]);

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(
      state.trackedProjects.some((project) => project.id === 'discovered-owner-new-decomp'),
    ).toBe(true);
    expect(state.trackedProjects.length).toBe(seeded.trackedProjects.length + 1);
  });

  it('repairs catalogs persisted by older builds without discarding them', async () => {
    // Updating Classicomp must never cost the player their data. An earlier
    // version replaced the entire catalogue whenever a stored record lacked a
    // field the new build expected — throwing away every scan result, every
    // discovered project, and days of rotation progress.
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const first = await createBrowserBridge(storage).loadState();

    // A discovered project and real scan results, as a running install has.
    const template = first.trackedProjects[0];
    const legacy = [
      ...first.trackedProjects.map((project) => {
        // Persisted by a build that predates these fields entirely.
        const { downloadAssets: _a, recentReleases: _b, coverAspect: _c, ...rest } = project;
        return { ...rest, latestVersion: 'v9.9.9-scanned', lastCheckedAt: '2026-08-01T00:00:00Z' };
      }),
      {
        ...template,
        id: 'discovered-owner-found-recomp',
        gameKey: 'found-game',
        gameTitle: 'Found Game',
        gameShortTitle: 'Found Game',
        gameId: null,
        repositoryUrl: 'https://github.com/owner/found-recomp',
      },
    ];
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({
        ...first,
        trackedProjects: legacy,
        trackingLastScanAt: '2026-08-01T00:00:00Z',
        libraries: {
          owner: [
            {
              gameId: 'devilutionx',
              installState: 'installed',
              installPath: '/games/devilutionx/run',
              playMinutes: 120,
            },
          ],
        },
      }),
    );

    const reloaded = await createBrowserBridge(storage).loadState();

    // Missing fields filled in, so nothing downstream crashes.
    expect(
      reloaded.trackedProjects.every(
        (project) =>
          Array.isArray(project.downloadAssets) && Array.isArray(project.recentReleases),
      ),
    ).toBe(true);
    // Scan results survived rather than being reset to the bundled seed.
    expect(
      reloaded.trackedProjects.some((project) => project.latestVersion === 'v9.9.9-scanned'),
    ).toBe(true);
    expect(reloaded.trackingLastScanAt).toBe('2026-08-01T00:00:00Z');
    // The auto-discovered project survived.
    expect(
      reloaded.trackedProjects.some((p) => p.id === 'discovered-owner-found-recomp'),
    ).toBe(true);
    // And so did the installed game, with its play time and launch target.
    const entry = reloaded.libraries.owner.find((item) => item.gameId === 'devilutionx');
    expect(entry?.installState).toBe('installed');
    expect(entry?.installPath).toBe('/games/devilutionx/run');
    expect(entry?.playMinutes).toBe(120);
  });

  it('inherits state from an older storage key rather than starting empty', async () => {
    // The other half of "updating must not delete everything": a version that
    // renames the storage key would otherwise greet the player with a fresh
    // install and no library at all.
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const seeded = await createBrowserBridge(storage).loadState();

    const previous = {
      ...seeded,
      libraries: {
        owner: [
          {
            gameId: 'devilutionx',
            installState: 'installed',
            installPath: '/games/devilutionx/run',
            playMinutes: 300,
            romPath: null,
            downloadedFile: null,
            installedVersion: '1.5.5',
          },
        ],
      },
    };
    storage.clear();
    storage.setItem('classicomp.app-state', JSON.stringify(previous));

    const state = await createBrowserBridge(storage).loadState();
    const entry = state.libraries.owner.find((item) => item.gameId === 'devilutionx');
    expect(entry?.playMinutes).toBe(300);
    expect(entry?.installedVersion).toBe('1.5.5');
    // Rewritten under the current key, with the original kept as a backup so a
    // bad migration is recoverable rather than fatal.
    expect(storage.getItem('classicomp.app-state.v2')).toBeTruthy();
    expect(storage.getItem('classicomp.app-state.pre-migration')).toBeTruthy();
  });

  it('resets catalogs persisted by builds that lacked newer array fields', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const state = await createBrowserBridge(storage).loadState();
    const legacy = state.trackedProjects.map((project) => {
      const { downloadAssets: _dropped, ...rest } = project;
      return rest;
    });
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, trackedProjects: legacy }),
    );

    const reloaded = await createBrowserBridge(storage).loadState();
    expect(
      reloaded.trackedProjects.every((project) => Array.isArray(project.downloadAssets)),
    ).toBe(true);
  });

  it('applies bundled identity corrections to stored records while keeping scan data', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const state = await createBrowserBridge(storage).loadState();
    const tampered = state.trackedProjects.map((project) =>
      project.id === 'dusklight'
        ? {
            ...project,
            gameTitle: 'Wrong Title',
            gameShortTitle: 'Wrong',
            latestVersion: 'v9.9-scan',
          }
        : project,
    );
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, trackedProjects: tampered }),
    );

    const reloaded = await createBrowserBridge(storage).loadState();
    const dusklight = reloaded.trackedProjects.find((project) => project.id === 'dusklight');
    expect(dusklight?.gameTitle).toBe('The Legend of Zelda: Twilight Princess');
    expect(dusklight?.gameShortTitle).toBe('Twilight Princess');
    expect(dusklight?.latestVersion).toBe('v9.9-scan');
  });

  it('refreshes stale baked galleries from the seed while keeping scan-earned shots', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const state = await createBrowserBridge(storage).loadState();
    const seeded = state.trackedProjects.find((project) =>
      project.screenshots.some((url) => url.includes('libretro')),
    );
    expect(seeded).toBeDefined();
    const tampered = state.trackedProjects.map((project) =>
      project.id === seeded?.id
        ? {
            ...project,
            screenshots: [
              'https://i.ytimg.com/vi/x/hqdefault.jpg',
              'https://images.igdb.com/igdb/image/upload/t_1080p/hd1.jpg',
            ],
          }
        : project,
    );
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, trackedProjects: tampered }),
    );

    const reloaded = await createBrowserBridge(storage).loadState();
    const refreshed = reloaded.trackedProjects.find((project) => project.id === seeded?.id);
    expect(refreshed?.screenshots.some((url) => url.includes('libretro'))).toBe(true);
    expect(refreshed?.screenshots).toContain(
      'https://images.igdb.com/igdb/image/upload/t_1080p/hd1.jpg',
    );
    expect(refreshed?.screenshots.some((url) => url.includes('ytimg'))).toBe(false);
  });

  it('replaces a stored cover with the curated seed cover but keeps scan-earned covers', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const state = await createBrowserBridge(storage).loadState();
    const withSeedCover = state.trackedProjects.find((project) => project.coverUrl !== null);
    const withoutSeedCover = state.trackedProjects.find((project) => project.coverUrl === null);
    expect(withSeedCover).toBeDefined();
    expect(withoutSeedCover).toBeDefined();
    const tampered = state.trackedProjects.map((project) => {
      if (project.id === withSeedCover?.id) {
        // A scan once stored the wrong game's box art; the seed correction
        // must win on the next load.
        return { ...project, coverUrl: 'https://example.com/wrong-box.jpg', coverAspect: 0.7 };
      }
      if (project.id === withoutSeedCover?.id) {
        return { ...project, coverUrl: 'https://example.com/scan-earned.jpg', coverAspect: 0.7 };
      }
      return project;
    });
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, trackedProjects: tampered }),
    );

    const reloaded = await createBrowserBridge(storage).loadState();
    const corrected = reloaded.trackedProjects.find((p) => p.id === withSeedCover?.id);
    const kept = reloaded.trackedProjects.find((p) => p.id === withoutSeedCover?.id);
    expect(corrected?.coverUrl).toBe(withSeedCover?.coverUrl);
    expect(kept?.coverUrl).toBe('https://example.com/scan-earned.jpg');
  });

  it('renames stored library games to the bundled game names, keeping install state', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const state = await createBrowserBridge(storage).loadState();
    // A store persisted before the rename holds the BUILD name where the
    // game name belongs, plus install-owned fields that must survive.
    const stale = state.games.map((game) =>
      game.id === 'devilutionx'
        ? {
            ...game,
            title: 'DevilutionX',
            shortTitle: 'DX',
            executablePath: '/games/devilutionx/run.sh',
            version: '1.4.0-stored',
          }
        : game,
    );
    storage.setItem('classicomp.app-state.v2', JSON.stringify({ ...state, games: stale }));

    const reloaded = await createBrowserBridge(storage).loadState();
    const diablo = reloaded.games.find((game) => game.id === 'devilutionx');
    expect(diablo?.title).toBe('Diablo');
    expect(diablo?.shortTitle).toBe('Diablo');
    expect(diablo?.executablePath).toBe('/games/devilutionx/run.sh');
    expect(diablo?.version).toBe('1.4.0-stored');
  });

  it('retitles known discovered records and drops non-game repos on load', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const bridge = createBrowserBridge(storage);
    const seeded = await bridge.loadState();
    const template = seeded.trackedProjects[0];
    await bridge.addTrackedProjects([
      {
        ...template,
        id: 'discovered-krystalgamer-spidey-decomp',
        gameKey: 'spidey',
        gameTitle: 'Spidey',
        gameShortTitle: 'Spidey',
        gameId: null,
        projectName: 'spidey-decomp',
        repositoryUrl: 'https://github.com/krystalgamer/spidey-decomp',
        screenshots: ['https://upload.wikimedia.org/wrong-game.jpg'],
      },
      {
        ...template,
        id: 'discovered-someone-awesome-game-decompilations',
        gameKey: 'awesome-game-decompilations',
        gameTitle: 'Awesome Game Decompilations',
        gameShortTitle: 'Awesome Game Decompilations',
        gameId: null,
        projectName: 'awesome-game-decompilations',
        repositoryUrl: 'https://github.com/someone/awesome-game-decompilations',
      },
    ]);

    const reloaded = await createBrowserBridge(storage).loadState();
    const spidey = reloaded.trackedProjects.find(
      (project) => project.id === 'discovered-krystalgamer-spidey-decomp',
    );
    expect(spidey?.gameTitle).toBe('Spider-Man (2000)');
    expect(spidey?.gameKey).toBe('spider-man-2000');
    // The wrong-game media is dropped and replaced by the fix's curated
    // IGDB gallery and cover.
    expect(spidey?.screenshots).not.toContain('https://upload.wikimedia.org/wrong-game.jpg');
    expect(spidey?.screenshots.every((url) => url.includes('images.igdb.com'))).toBe(true);
    expect(spidey?.screenshots.length).toBeGreaterThan(0);
    expect(spidey?.coverUrl).toContain('images.igdb.com');
    expect(
      reloaded.trackedProjects.some((project) =>
        project.id.includes('awesome-game-decompilations'),
      ),
    ).toBe(false);
  });

  it('persists uninstalls across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);
    await firstRun.queueInstall('devilutionx');
    await firstRun.uninstallGame('devilutionx');

    const state = await createBrowserBridge(storage).loadState();
    expect(state.libraries.owner ?? []).toHaveLength(0);
    expect(state.downloads).toHaveLength(0);
  });

  it('maps a legacy persisted downloads route to the store main page', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();

    const firstRun = createBrowserBridge(storage);
    const state = await firstRun.loadState();
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, route: 'downloads' }),
    );

    expect((await createBrowserBridge(storage).loadState()).route).toBe('store');
  });
});
