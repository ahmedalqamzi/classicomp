import { describe, expect, it } from 'vitest';
import type { TrackedProject } from '../domain/types';
import * as collectorModule from './tracking-collector';

function makeProject(overrides: Partial<TrackedProject>): TrackedProject {
  return {
    id: 'project',
    gameKey: 'game',
    gameTitle: 'Game',
    gameShortTitle: 'Game',
    gameId: null,
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
    repositoryUrl: 'https://github.com/example/project',
    ...overrides,
  };
}

const T0 = '2026-08-14T12:00:00Z';
const atT0 = () => T0;

function fakeFetch(routes: Record<string, unknown>) {
  const requested: string[] = [];
  const fetchFn = async (url: string) => {
    requested.push(url);
    const body = routes[url];
    return {
      ok: body !== undefined,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  return { fetchFn, requested };
}

describe('tracking collector', () => {
  it('reads release and activity evidence from the GitHub API', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
        description: 'An engine reimplementation.',
      },
      'https://api.github.com/repos/example/project/releases?per_page=5': [
        { tag_name: 'nightly', published_at: '2026-08-11T00:00:00Z', prerelease: true },
        {
          tag_name: 'v2.0',
          html_url: 'https://github.com/example/project/releases/tag/v2.0',
          published_at: '2026-08-01T00:00:00Z',
        },
      ],
      'https://raw.githubusercontent.com/example/project/HEAD/README.md':
        '# Project\n![screenshot](docs/shot1.png)\n![badge](https://img.shields.io/x.svg)\n<img src="https://example.com/gameplay.jpg">',
      'https://en.wikipedia.org/api/rest_v1/page/summary/Game': {
        type: 'standard',
        extract: 'A classic video game.',
        originalimage: {
          source: 'https://upload.wikimedia.org/game-cover.jpg',
          width: 300,
          height: 420,
        },
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [makeProject({})],
      fetchFn,
      atT0,
    );

    expect(updates).toEqual([
      {
        id: 'project',
        latestVersion: 'v2.0',
        lastActivityAt: '2026-08-10T00:00:00Z',
        developmentState: null,
        downloadUrl: 'https://github.com/example/project/releases/tag/v2.0',
        description: 'An engine reimplementation.',
        topics: null,
        screenshots: [
          'https://raw.githubusercontent.com/example/project/HEAD/docs/shot1.png',
          'https://example.com/gameplay.jpg',
        ],
        recentReleases: [
          {
            version: 'v2.0',
            url: 'https://github.com/example/project/releases/tag/v2.0',
            publishedAt: '2026-08-01T00:00:00Z',
          },
        ],
        downloadAssets: null,
        coverUrl: 'https://upload.wikimedia.org/game-cover.jpg',
        coverAspect: 300 / 420,
        coverChecked: true,
        checkedAt: T0,
      },
    ]);
    expect(requested).toContain('https://api.github.com/repos/example/project');
    expect(requested).toContain(
      'https://raw.githubusercontent.com/example/project/HEAD/README.md',
    );
  });

  it('falls back to prereleases for projects that never cut a stable tag', async () => {
    // Most recompilations in this catalogue are pre-1.0 and ship every build
    // as a prerelease. Bomberman Hero, Crash Team Racing, Ace Combat 6 and
    // Animal Crossing all had working Linux downloads that were invisible
    // because every release was flagged prerelease.
    const { fetchFn } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
      },
      'https://api.github.com/repos/example/project/releases?per_page=5': [
        {
          tag_name: 'v0.7.1',
          html_url: 'https://github.com/example/project/releases/tag/v0.7.1',
          published_at: '2026-08-11T00:00:00Z',
          prerelease: true,
          assets: [
            {
              name: 'Recompiled-AppImage-X64-Release.zip',
              browser_download_url: 'https://example.com/x64.zip',
              size: 4096,
            },
          ],
        },
      ],
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [makeProject({})],
      fetchFn,
      atT0,
    );

    expect(updates[0].latestVersion).toBe('v0.7.1');
    expect(updates[0].downloadAssets).toEqual([
      {
        name: 'Recompiled-AppImage-X64-Release.zip',
        url: 'https://example.com/x64.zip',
        sizeBytes: 4096,
      },
    ]);
  });

  it('preserves stored screenshots without requesting the GitHub README', async () => {
    const readmeUrl = 'https://raw.githubusercontent.com/example/project/HEAD/README.md';
    const { fetchFn, requested } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
      },
      [readmeUrl]: '# Project\n![replacement](docs/replacement.png)',
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({
          projectType: 'matching-decompilation',
          coverUrl: 'https://example.com/cover.jpg',
          coverAspect: 0.75,
          screenshots: ['https://example.com/curated-gameplay.jpg'],
        }),
      ],
      fetchFn,
      atT0,
    );

    expect(updates[0].screenshots).toBeNull();
    expect(requested).not.toContain(readmeUrl);
  });

  it('appends the Steam HD gallery after seeded captures', async () => {
    const seededShot = 'https://thumbnails.libretro.com/snap.png';
    const { fetchFn } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
      },
      'https://steamcommunity.com/actions/SearchApps/Game': [{ appid: '7', name: 'Game' }],
      'https://store.steampowered.com/api/appdetails?appids=7&filters=screenshots': {
        7: {
          success: true,
          data: {
            screenshots: [
              { path_full: 'https://shared.akamai.steamstatic.com/apps/7/ss_hd-1.jpg' },
              { path_full: 'https://shared.akamai.steamstatic.com/apps/7/ss_hd-2.jpg' },
            ],
          },
        },
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({
          projectType: 'matching-decompilation',
          coverUrl: 'https://example.com/cover.jpg',
          coverAspect: 0.75,
          screenshots: [seededShot],
        }),
      ],
      fetchFn,
      atT0,
    );

    expect(updates[0].screenshots).toEqual([
      seededShot,
      'https://shared.akamai.steamstatic.com/apps/7/ss_hd-1.jpg',
      'https://shared.akamai.steamstatic.com/apps/7/ss_hd-2.jpg',
    ]);
    // The screenshots-only lookup must not clobber the validated cover.
    expect(updates[0].coverUrl).toBeNull();
    expect(updates[0].coverChecked).toBe(false);
  });

  it('skips the Steam lookup once the gallery already carries Steam shots', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({
          projectType: 'matching-decompilation',
          coverUrl: 'https://example.com/cover.jpg',
          coverAspect: 0.75,
          screenshots: [
            'https://thumbnails.libretro.com/snap.png',
            'https://shared.akamai.steamstatic.com/apps/7/ss_hd-1.jpg',
          ],
        }),
      ],
      fetchFn,
      atT0,
    );

    expect(updates[0].screenshots).toBeNull();
    expect(requested.filter((url) => url.includes('steam'))).toEqual([]);
  });

  it('treats IGDB shots as HD-complete and skips further media lookups', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({
          projectType: 'matching-decompilation',
          coverUrl: 'https://example.com/cover.jpg',
          coverAspect: 0.75,
          screenshots: [
            'https://thumbnails.libretro.com/snap.png',
            'https://images.igdb.com/igdb/image/upload/t_1080p/bd1.jpg',
          ],
        }),
      ],
      fetchFn,
      atT0,
    );

    expect(updates[0].screenshots).toBeNull();
    expect(requested.filter((url) => url.includes('igdb') || url.includes('steam'))).toEqual([]);
  });

  it('marks archived repositories and skips release lookups for source projects', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://api.github.com/repos/example/decomp': {
        pushed_at: '2026-07-01T00:00:00Z',
        archived: true,
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({
          id: 'decomp',
          projectType: 'matching-decompilation',
          repositoryUrl: 'https://github.com/example/decomp',
        }),
      ],
      fetchFn,
    );

    expect(updates[0]).toMatchObject({
      id: 'decomp',
      latestVersion: null,
      developmentState: 'archived',
      description: null,
    });
    expect(requested).toContain('https://api.github.com/repos/example/decomp');
    expect(requested.some((url) => url.includes('/releases'))).toBe(false);
  });

  it('reads GitLab projects through the encoded projects API', async () => {
    const { fetchFn } = fakeFetch({
      'https://gitlab.com/api/v4/projects/OpenMW%2Fopenmw': {
        last_activity_at: '2026-08-12T00:00:00Z',
        archived: false,
      },
      'https://gitlab.com/api/v4/projects/OpenMW%2Fopenmw/releases?per_page=1': [
        { tag_name: 'openmw-0.50.0', released_at: '2026-08-05T00:00:00Z' },
      ],
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [makeProject({ id: 'openmw', repositoryUrl: 'https://gitlab.com/OpenMW/openmw' })],
      fetchFn,
      atT0,
    );

    expect(updates[0]).toEqual({
      id: 'openmw',
      latestVersion: 'openmw-0.50.0',
      lastActivityAt: '2026-08-12T00:00:00Z',
      developmentState: null,
      downloadUrl: 'https://gitlab.com/OpenMW/openmw/-/releases/openmw-0.50.0',
      description: null,
      topics: null,
      screenshots: null,
      recentReleases: [
        {
          version: 'openmw-0.50.0',
          url: 'https://gitlab.com/OpenMW/openmw/-/releases/openmw-0.50.0',
          publishedAt: '2026-08-05T00:00:00Z',
        },
      ],
      downloadAssets: null,
      coverUrl: null,
      coverAspect: null,
      coverChecked: true,
      checkedAt: T0,
    });
  });

  it('preserves the last verified record when a single source fails', async () => {
    const { fetchFn } = fakeFetch({
      'https://api.github.com/repos/example/project': {
        pushed_at: '2026-08-10T00:00:00Z',
        archived: false,
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({}),
        makeProject({ id: 'broken', repositoryUrl: 'https://github.com/example/missing' }),
        makeProject({ id: 'unknown-host', repositoryUrl: 'https://example.org/somewhere' }),
      ],
      fetchFn,
      atT0,
    );

    expect(updates[1]).toEqual({
      id: 'broken',
      latestVersion: null,
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
      coverChecked: true,
      checkedAt: T0,
    });
    expect(updates[2]).toEqual({
      id: 'unknown-host',
      latestVersion: null,
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
      coverChecked: true,
      checkedAt: T0,
    });
  });

  it('resets archived records when the repository is unarchived', async () => {
    const { fetchFn } = fakeFetch({
      'https://api.github.com/repos/example/revived': {
        pushed_at: '2026-08-14T00:00:00Z',
        archived: false,
      },
    });

    const updates = await collectorModule.collectTrackingUpdates(
      [
        makeProject({
          id: 'revived',
          projectType: 'matching-decompilation',
          developmentState: 'archived',
          repositoryUrl: 'https://github.com/example/revived',
        }),
      ],
      fetchFn,
      atT0,
    );

    expect(updates[0]).toMatchObject({ id: 'revived', developmentState: 'unknown' });
  });

  it('scans the least recently checked projects first, capped at the batch size', () => {
    const projects = [
      makeProject({ id: 'recent', lastCheckedAt: '2026-08-14T00:00:00Z' }),
      makeProject({ id: 'never-checked', lastCheckedAt: null }),
      makeProject({ id: 'stale', lastCheckedAt: '2026-08-01T00:00:00Z' }),
    ];

    const batch = collectorModule.selectScanBatch(projects, 2);
    expect(batch.map((project) => project.id)).toEqual(['never-checked', 'stale']);
    expect(collectorModule.selectScanBatch(projects).map((project) => project.id)).toEqual([
      'never-checked',
      'stale',
      'recent',
    ]);
  });

  it('throws when no source at all can be reached', async () => {
    const failingFetch = async () => {
      throw new Error('offline');
    };

    await expect(
      collectorModule.collectTrackingUpdates([makeProject({})], failingFetch),
    ).rejects.toThrow('No tracking source could be reached.');
  });
});
