import { describe, expect, it } from 'vitest';
import type { TrackedProject } from '../domain/types';
import * as discoveryModule from './project-discovery';

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
    originalPlatforms: [],
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
    repositoryUrl: 'https://github.com/example/project',
    ...overrides,
  };
}

function searchFetch(items: unknown[]) {
  const requested: string[] = [];
  const fetchFn = async (url: string) => {
    requested.push(url);
    return { ok: true, json: async () => ({ items }) };
  };
  return { fetchFn, requested };
}

describe('project discovery', () => {
  it('maps plausible new repositories into catalogued store records', async () => {
    const { fetchFn, requested } = searchFetch([
      {
        full_name: 'someone/banjo-tooie-decomp',
        name: 'banjo-tooie-decomp',
        description: 'Matching decompilation of Banjo-Tooie.',
        html_url: 'https://github.com/someone/banjo-tooie-decomp',
        pushed_at: '2026-08-14T00:00:00Z',
        topics: ['decompilation', 'n64'],
      },
    ]);

    const discovered = await discoveryModule.discoverNewProjects([makeProject({})], fetchFn, 0);

    expect(requested[0]).toContain('api.github.com/search/repositories');
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toMatchObject({
      id: 'discovered-someone-banjo-tooie-decomp',
      gameTitle: 'Banjo Tooie',
      gameShortTitle: 'Banjo Tooie',
      projectType: 'decompilation',
      developmentState: 'unknown',
      completionLabel: 'Catalogued; verification queued',
      originalReleaseYear: 0,
      lastCheckedAt: null,
      repositoryUrl: 'https://github.com/someone/banjo-tooie-decomp',
    });
  });

  it('skips known repositories, forks, archived repos, and undescribed repos', async () => {
    const { fetchFn } = searchFetch([
      {
        full_name: 'example/project',
        name: 'project',
        description: 'Already tracked.',
        html_url: 'https://github.com/example/project',
      },
      {
        full_name: 'a/fork-decomp',
        name: 'fork-decomp',
        description: 'A fork.',
        html_url: 'https://github.com/a/fork-decomp',
        fork: true,
      },
      {
        full_name: 'b/archived-decomp',
        name: 'archived-decomp',
        description: 'Archived.',
        html_url: 'https://github.com/b/archived-decomp',
        archived: true,
      },
      {
        full_name: 'c/no-description',
        name: 'no-description',
        html_url: 'https://github.com/c/no-description',
      },
    ]);

    const discovered = await discoveryModule.discoverNewProjects([makeProject({})], fetchFn, 0);
    expect(discovered).toEqual([]);
  });

  it('caps additions per pass', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      full_name: `owner/game-${index}-decomp`,
      name: `game-${index}-decomp`,
      description: `Decompilation ${index}.`,
      html_url: `https://github.com/owner/game-${index}-decomp`,
    }));
    const { fetchFn } = searchFetch(items);

    const discovered = await discoveryModule.discoverNewProjects([], fetchFn, 0);
    expect(discovered).toHaveLength(discoveryModule.MAX_DISCOVERIES_PER_PASS);
  });
});
