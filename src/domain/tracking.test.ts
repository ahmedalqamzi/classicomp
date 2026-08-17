import { describe, expect, it } from 'vitest';
import * as trackingModule from './tracking';
import type { TrackedProject } from './types';

function makeProject(overrides: Partial<TrackedProject>): TrackedProject {
  return {
    id: 'project',
    gameKey: 'game',
    gameTitle: 'Game',
    gameShortTitle: 'Game',
    gameId: null,
    description: null,
    projectName: 'Project',
    projectType: 'source-port',
    developmentState: 'active',
    stability: 'stable',
    completionPercent: null,
    completionLabel: 'Released',
    originalReleaseYear: 2000,
    originalPlatforms: ['Nintendo 64'],
    targetPlatforms: ['Linux'],
    latestVersion: '1.0',
    lastActivityAt: null,
    lastCheckedAt: null,
    downloadUrl: null,
    coverUrl: null,
    coverAspect: null,
    screenshots: [],
    topics: [],
    recentReleases: [],
    downloadAssets: [],
    repositoryUrl: 'https://example.com/project',
    ...overrides,
  };
}

describe('tracked project availability', () => {
  it('derives launcher-facing availability from stability and project type', () => {
    expect(trackingModule.projectAvailability(makeProject({ stability: 'stable' }))).toBe(
      'released',
    );
    expect(trackingModule.projectAvailability(makeProject({ stability: 'playable' }))).toBe(
      'playable',
    );
    expect(
      trackingModule.projectAvailability(
        makeProject({ stability: 'experimental', developmentState: 'active' }),
      ),
    ).toBe('in-development');
    expect(
      trackingModule.projectAvailability(
        makeProject({ projectType: 'matching-decompilation', stability: 'unknown' }),
      ),
    ).toBe('source-only');
    expect(
      trackingModule.projectAvailability(
        makeProject({ stability: 'unknown', developmentState: 'archived' }),
      ),
    ).toBe('inactive');
    // A port that publishes releases is released even before its stability
    // has been verified — it must never present as unreleased.
    expect(
      trackingModule.projectAvailability(
        makeProject({
          stability: 'unknown',
          developmentState: 'unknown',
          latestVersion: 'v1.0.2',
        }),
      ),
    ).toBe('released');
    expect(
      trackingModule.projectAvailability(
        makeProject({
          stability: 'unknown',
          developmentState: 'archived',
          latestVersion: 'v1.0.2',
        }),
      ),
    ).toBe('inactive');
  });
});

describe('tracked game grouping', () => {
  it('groups implementations under one game with the best availability', () => {
    const games = trackingModule.groupTrackedProjects([
      makeProject({
        id: 'recomp',
        gameKey: 'majoras-mask',
        gameTitle: "Majora's Mask",
        projectType: 'static-recompilation',
        stability: 'stable',
        lastActivityAt: '2026-01-01T00:00:00Z',
      }),
      makeProject({
        id: 'decomp',
        gameKey: 'majoras-mask',
        gameTitle: "Majora's Mask",
        projectType: 'matching-decompilation',
        stability: 'unknown',
        lastActivityAt: '2026-02-01T00:00:00Z',
      }),
      makeProject({ id: 'other', gameKey: 'another-game', gameTitle: 'Another Game' }),
    ]);

    expect(games).toHaveLength(2);
    const majora = games.find((game) => game.gameKey === 'majoras-mask');
    expect(majora?.projects.map((project) => project.id)).toEqual(['recomp', 'decomp']);
    expect(majora?.availability).toBe('released');
    expect(majora?.latestActivityAt).toBe('2026-02-01T00:00:00Z');
  });

  it('sorts grouped games alphabetically by title', () => {
    const games = trackingModule.groupTrackedProjects([
      makeProject({ id: 'z', gameKey: 'zeta', gameTitle: 'Zeta' }),
      makeProject({ id: 'a', gameKey: 'alpha', gameTitle: 'Alpha' }),
    ]);
    expect(games.map((game) => game.gameTitle)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('tracked game filtering', () => {
  const games = trackingModule.groupTrackedProjects([
    makeProject({
      id: 'recomp',
      gameKey: 'majoras-mask',
      gameTitle: "Majora's Mask",
      projectName: 'Zelda 64: Recompiled',
      stability: 'stable',
    }),
    makeProject({
      id: 'decomp',
      gameKey: 'perfect-dark',
      gameTitle: 'Perfect Dark',
      projectType: 'matching-decompilation',
      stability: 'unknown',
    }),
  ]);

  it('matches the query against game and implementation names', () => {
    const byGame = trackingModule.filterTrackedGames(
      games,
      { ...trackingModule.EMPTY_TRACKING_FILTERS, query: 'majora' },
      new Set(),
    );
    expect(byGame.map((game) => game.gameKey)).toEqual(['majoras-mask']);

    const byProject = trackingModule.filterTrackedGames(
      games,
      { ...trackingModule.EMPTY_TRACKING_FILTERS, query: 'recompiled' },
      new Set(),
    );
    expect(byProject.map((game) => game.gameKey)).toEqual(['majoras-mask']);
  });

  it('filters by availability and by watched games', () => {
    const released = trackingModule.filterTrackedGames(
      games,
      { ...trackingModule.EMPTY_TRACKING_FILTERS, availability: 'released' },
      new Set(),
    );
    expect(released.map((game) => game.gameKey)).toEqual(['majoras-mask']);

    const watched = trackingModule.filterTrackedGames(
      games,
      { ...trackingModule.EMPTY_TRACKING_FILTERS, watchedOnly: true },
      new Set(['perfect-dark']),
    );
    expect(watched.map((game) => game.gameKey)).toEqual(['perfect-dark']);
  });
});

describe('watchlist selection', () => {
  it('returns the active profile watchlist and nothing when signed out', () => {
    const base = {
      activeProfileId: 'owner',
      watchlists: { owner: ['majoras-mask'], guest: [] },
    };
    expect(trackingModule.selectWatchedGameKeys(base)).toEqual(new Set(['majoras-mask']));
    expect(
      trackingModule.selectWatchedGameKeys({ ...base, activeProfileId: null }),
    ).toEqual(new Set());
  });
});

describe('library records derived from tracked projects', () => {
  it('keys a scanned project on its gameKey so ports of one game share an entry', () => {
    const recomp = makeProject({ id: 'a', gameKey: 'majoras-mask', projectName: 'Recomp' });
    const port = makeProject({ id: 'b', gameKey: 'majoras-mask', projectName: 'Port' });
    expect(trackingModule.libraryGameId(recomp)).toBe('majoras-mask');
    expect(trackingModule.libraryGameId(port)).toBe(trackingModule.libraryGameId(recomp));

    // A seeded gameId still wins, so existing library entries keep their id.
    expect(trackingModule.libraryGameId(makeProject({ gameId: 'devilutionx' }))).toBe(
      'devilutionx',
    );
  });

  it('builds a renderable game record from the project alone', () => {
    const game = trackingModule.gameFromTrackedProject(
      makeProject({
        gameTitle: "The Legend of Zelda: Majora's Mask",
        gameShortTitle: "Majora's Mask",
        gameKey: 'majoras-mask',
        projectName: 'Zelda 64: Recompiled',
        latestVersion: 'v1.2.2',
        coverUrl: 'https://example.com/cover.png',
      }),
    );
    expect(game.id).toBe('majoras-mask');
    expect(game.title).toBe("The Legend of Zelda: Majora's Mask");
    expect(game.summary).toContain('Zelda 64: Recompiled');
    expect(game.artworkUrl).toBe('https://example.com/cover.png');
    expect(game.version).toBe('v1.2.2');
    // Nothing is on disk at this point.
    expect(game.executablePath).toBeNull();
  });
});

describe('update detection', () => {
  const projects = [makeProject({ latestVersion: 'v2.0' })];

  it('reports an update when the installed version has fallen behind', () => {
    expect(
      trackingModule.updateAvailable(
        { installState: 'installed', installedVersion: 'v1.0' },
        projects,
      ),
    ).toBe('v2.0');
  });

  it('reports nothing when the installed version is current', () => {
    expect(
      trackingModule.updateAvailable(
        { installState: 'installed', installedVersion: 'v2.0' },
        projects,
      ),
    ).toBeNull();
  });

  it('never calls an install stale when its version was never recorded', () => {
    // Entries that predate version tracking would otherwise nag forever, and
    // auto-update would redownload them on every scan.
    expect(
      trackingModule.updateAvailable(
        { installState: 'installed', installedVersion: null },
        projects,
      ),
    ).toBeNull();
  });

  it('ignores games that are downloaded but not installed', () => {
    expect(
      trackingModule.updateAvailable(
        { installState: 'downloaded', installedVersion: 'v1.0' },
        projects,
      ),
    ).toBeNull();
  });
});
