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
    trackedProjects: [
      {
        id: 'devilutionx',
        gameKey: 'diablo',
        gameTitle: 'Diablo',
        gameShortTitle: 'Diablo',
        gameId: 'devilutionx',
        description: 'Diablo engine reconstruction.',
        projectName: 'DevilutionX',
        projectType: 'source-port',
        developmentState: 'active',
        stability: 'stable',
        completionPercent: null,
        completionLabel: 'Released',
        originalReleaseYear: 1997,
        originalPlatforms: ['Windows'],
        targetPlatforms: ['Windows', 'Linux'],
        latestVersion: '1.5.4',
        lastActivityAt: null,
        lastCheckedAt: null,
        downloadUrl: null,
        coverUrl: null,
        coverAspect: null,
        screenshots: [],
        topics: [],
        recentReleases: [],
        downloadAssets: [],
        repositoryUrl: 'https://github.com/diasurgical/devilutionX',
      },
      {
        id: 'sm64-decomp',
        gameKey: 'super-mario-64',
        gameTitle: 'Super Mario 64',
        gameShortTitle: 'Super Mario 64',
        gameId: null,
        description: null,
        projectName: 'Super Mario 64 decompilation',
        projectType: 'matching-decompilation',
        developmentState: 'maintenance',
        stability: 'unknown',
        completionPercent: null,
        completionLabel: 'Buildable decompilation; percentage not published',
        originalReleaseYear: 1996,
        originalPlatforms: ['Nintendo 64'],
        targetPlatforms: [],
        latestVersion: null,
        lastActivityAt: null,
        lastCheckedAt: null,
        downloadUrl: null,
        coverUrl: null,
        coverAspect: null,
        screenshots: [],
        topics: [],
        recentReleases: [],
        downloadAssets: [],
        repositoryUrl: 'https://github.com/n64decomp/sm64',
      },
    ],
    watchlists: {
      alex: ['diablo'],
      mira: [],
    },
    releaseNotices: [],
    trackingLastScanAt: null,
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
      route: 'store',
    });

    expect(next.route).toBe('store');
    expect(initial.route).toBe('library');
  });

  it('selects a game and returns to its library detail page', () => {
    const initial = { ...makeState(), route: 'store' as const };
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

  it('toggles a tracked-game watch only for the active profile', () => {
    const watched = stateModule.reduceAppState(makeState(), {
      type: 'tracking/toggleWatch',
      gameKey: 'super-mario-64',
    });
    expect(watched.watchlists.alex).toEqual(['diablo', 'super-mario-64']);
    expect(watched.watchlists.mira).toEqual([]);

    const unwatched = stateModule.reduceAppState(watched, {
      type: 'tracking/toggleWatch',
      gameKey: 'diablo',
    });
    expect(unwatched.watchlists.alex).toEqual(['super-mario-64']);
  });

  it('ignores watch toggles when signed out or for untracked games', () => {
    const signedOut = { ...makeState(), activeProfileId: null };
    expect(
      stateModule.reduceAppState(signedOut, {
        type: 'tracking/toggleWatch',
        gameKey: 'diablo',
      }),
    ).toBe(signedOut);

    const initial = makeState();
    expect(
      stateModule.reduceAppState(initial, {
        type: 'tracking/toggleWatch',
        gameKey: 'not-tracked',
      }),
    ).toBe(initial);
  });

  it('applies tracking updates while preserving fields without new evidence', () => {
    const next = stateModule.reduceAppState(makeState(), {
      type: 'tracking/applyUpdates',
      updates: [
        {
          id: 'devilutionx',
          latestVersion: '1.6.0',
          lastActivityAt: '2026-08-14T00:00:00Z',
          developmentState: null,
          downloadUrl: 'https://github.com/diasurgical/devilutionX/releases/tag/1.6.0',
          description: 'Diablo I engine for modern operating systems.',
          topics: ['diablo', 'game-engine'],
          screenshots: null,
          recentReleases: null,
          downloadAssets: null,
          coverUrl: 'https://upload.wikimedia.org/diablo.jpg',
          coverAspect: 0.72,
          coverChecked: true,
          checkedAt: '2026-08-14T12:00:00Z',
        },
        {
          id: 'unknown-project',
          latestVersion: '9.9',
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
          checkedAt: null,
        },
      ],
      scannedAt: '2026-08-14T12:00:00Z',
    });

    const devilutionx = next.trackedProjects.find((project) => project.id === 'devilutionx');
    expect(devilutionx?.latestVersion).toBe('1.6.0');
    expect(devilutionx?.lastActivityAt).toBe('2026-08-14T00:00:00Z');
    expect(devilutionx?.developmentState).toBe('active');
    expect(devilutionx?.downloadUrl).toBe(
      'https://github.com/diasurgical/devilutionX/releases/tag/1.6.0',
    );
    expect(devilutionx?.lastCheckedAt).toBe('2026-08-14T12:00:00Z');
    expect(devilutionx?.description).toBe('Diablo I engine for modern operating systems.');
    expect(devilutionx?.topics).toEqual(['diablo', 'game-engine']);
    expect(devilutionx?.screenshots).toEqual([]);
    expect(devilutionx?.coverUrl).toBe('https://upload.wikimedia.org/diablo.jpg');
    expect(devilutionx?.coverAspect).toBe(0.72);
    expect(next.trackingLastScanAt).toBe('2026-08-14T12:00:00Z');

    const untouched = next.trackedProjects.find((project) => project.id === 'sm64-decomp');
    expect(untouched).toEqual(makeState().trackedProjects[1]);
    expect(next.trackedProjects.map((project) => project.id)).toEqual([
      'devilutionx',
      'sm64-decomp',
    ]);
  });

  it('adds newly discovered projects once and ignores known ids', () => {
    const discovered = {
      ...makeState().trackedProjects[1],
      id: 'discovered-owner-new-decomp',
      gameKey: 'new-game',
      gameTitle: 'New Game',
      gameShortTitle: 'New Game',
      repositoryUrl: 'https://github.com/owner/new-decomp',
    };

    const next = stateModule.reduceAppState(makeState(), {
      type: 'tracking/addProjects',
      projects: [discovered, makeState().trackedProjects[0]],
    });
    expect(next.trackedProjects.map((project) => project.id)).toEqual([
      'devilutionx',
      'sm64-decomp',
      'discovered-owner-new-decomp',
    ]);

    const repeated = stateModule.reduceAppState(next, {
      type: 'tracking/addProjects',
      projects: [discovered],
    });
    expect(repeated).toBe(next);
  });

  it('links and clears an original copy without touching install state', () => {
    const queued = stateModule.reduceAppState(makeState(), {
      type: 'install/queue',
      gameId: 'devilutionx',
    });
    const linked = stateModule.reduceAppState(queued, {
      type: 'library/setRom',
      gameId: 'devilutionx',
      romPath: 'DIABDAT.MPQ',
    });
    const entry = linked.libraries.alex.find((item) => item.gameId === 'devilutionx');
    expect(entry?.romPath).toBe('DIABDAT.MPQ');
    // Linking a copy says nothing about whether the build is installed.
    expect(entry?.installState).toBe('queued');

    const cleared = stateModule.reduceAppState(linked, {
      type: 'library/setRom',
      gameId: 'devilutionx',
      romPath: null,
    });
    expect(cleared.libraries.alex.find((i) => i.gameId === 'devilutionx')?.romPath).toBeNull();

    // A game that is not in the library cannot have a copy linked to it.
    expect(
      stateModule.reduceAppState(cleared, {
        type: 'library/setRom',
        gameId: 'not-owned',
        romPath: 'x.rom',
      }),
    ).toBe(cleared);
  });

  it('adds a derived library game for a scanned project with no seeded record', () => {
    // Most of the catalogue is discovered by scanning and carries no gameId,
    // so the download path synthesises the library record. Without it the
    // entry exists but the library has nothing to render.
    const derived = {
      id: 'majoras-mask',
      title: "The Legend of Zelda: Majora's Mask",
      shortTitle: "Majora's Mask",
      summary: 'Played through Zelda 64: Recompiled',
      description: '',
      artworkUrl: null,
      iconUrl: null,
      runtime: 'Native',
      version: 'v1.2.2',
      executablePath: null,
      upstreamUrl: 'https://github.com/Zelda64Recomp/Zelda64Recomp',
      accent: 'hsl(200 48% 30%)',
      tags: [],
    };
    const next = stateModule.reduceAppState(makeState(), {
      type: 'install/queue',
      gameId: 'majoras-mask',
      game: derived,
    });

    expect(next.games.some((game) => game.id === 'majoras-mask')).toBe(true);
    expect(next.libraries.alex.some((entry) => entry.gameId === 'majoras-mask')).toBe(true);

    // Downloading a second project for the same game must not duplicate it.
    const again = stateModule.reduceAppState(next, {
      type: 'install/queue',
      gameId: 'majoras-mask',
      game: derived,
    });
    expect(again.games.filter((game) => game.id === 'majoras-mask')).toHaveLength(1);
  });

  it('uninstalls a game, removing its library entry and download', () => {
    const withDownload = stateModule.reduceAppState(makeState(), {
      type: 'install/queue',
      gameId: 'devilutionx',
    });
    const next = stateModule.reduceAppState(withDownload, {
      type: 'library/uninstall',
      gameId: 'devilutionx',
    });

    expect(next.libraries.alex.some((entry) => entry.gameId === 'devilutionx')).toBe(false);
    expect(next.downloads).toHaveLength(0);
    expect(next.libraries.mira).toHaveLength(1);

    const noop = stateModule.reduceAppState(next, {
      type: 'library/uninstall',
      gameId: 'devilutionx',
    });
    expect(noop).toBe(next);
  });

  it('raises a release notice when a wishlisted game gets a new version', () => {
    const next = stateModule.reduceAppState(makeState(), {
      type: 'tracking/applyUpdates',
      updates: [
        {
          id: 'devilutionx',
          latestVersion: '2.0.0',
          lastActivityAt: null,
          developmentState: null,
          downloadUrl: 'https://github.com/diasurgical/devilutionX/releases/tag/2.0.0',
          description: null,
          topics: null,
          screenshots: null,
          recentReleases: null,
          downloadAssets: null,
          coverUrl: null,
          coverAspect: null,
          coverChecked: false,
          checkedAt: '2026-08-15T10:00:00Z',
        },
      ],
      scannedAt: '2026-08-15T10:00:00Z',
    });

    expect(next.releaseNotices).toHaveLength(1);
    expect(next.releaseNotices[0]).toMatchObject({
      gameKey: 'diablo',
      gameShortTitle: 'Diablo',
      version: '2.0.0',
    });

    // Same update again must not duplicate the notice.
    const again = stateModule.reduceAppState(next, {
      type: 'tracking/applyUpdates',
      updates: [],
      scannedAt: '2026-08-15T11:00:00Z',
    });
    expect(again.releaseNotices).toHaveLength(1);

    const dismissed = stateModule.reduceAppState(next, {
      type: 'notices/dismiss',
      noticeId: next.releaseNotices[0].id,
    });
    expect(dismissed.releaseNotices).toHaveLength(0);
  });

  it('marks completed downloads as downloaded, never installed', () => {
    const queued = stateModule.reduceAppState(makeState(), {
      type: 'install/queue',
      gameId: 'devilutionx',
    });
    const done = stateModule.reduceAppState(queued, {
      type: 'download/setState',
      downloadId: 'download-alex-devilutionx',
      state: 'complete',
      progress: 100,
    });
    expect(done.libraries.alex.find((entry) => entry.gameId === 'devilutionx')?.installState).toBe(
      'downloaded',
    );
  });

  it('returns no library entries or mods when signed out', () => {
    const signedOut = { ...makeState(), activeProfileId: null };

    expect(stateModule.selectVisibleLibrary(signedOut)).toEqual([]);
    expect(stateModule.selectVisibleMods(signedOut)).toEqual([]);
  });
});
