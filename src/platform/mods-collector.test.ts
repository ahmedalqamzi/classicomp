import { describe, expect, it } from 'vitest';
import type { Game } from '../domain/types';
import * as modsModule from './mods-collector';

function makeGame(id: string): Game {
  return {
    id,
    title: id,
    shortTitle: id.slice(0, 2).toUpperCase(),
    summary: '',
    description: '',
    artworkUrl: null,
    iconUrl: null,
    runtime: 'Native Linux',
    version: '1.0',
    executablePath: null,
    upstreamUrl: `https://example.com/${id}`,
    accent: '#123456',
    tags: [],
  };
}

describe('live mods collector', () => {
  it('searches per known game and maps repositories to live mods', async () => {
    const requested: string[] = [];
    const fetchFn = async (url: string) => {
      requested.push(url);
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: 'modder/tamriel-rebuilt',
              name: 'tamriel-rebuilt',
              description: 'Mainland Morrowind expansion.',
              html_url: 'https://github.com/modder/tamriel-rebuilt',
              pushed_at: '2026-08-01T00:00:00Z',
              stargazers_count: 420,
              owner: { login: 'modder' },
            },
          ],
        }),
      };
    };

    const mods = await modsModule.collectLiveMods(
      [makeGame('openmw'), makeGame('unknown-game')],
      fetchFn,
    );

    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((url) => url.includes('search/repositories'))).toBe(true);
    // Only the known game is searched; the unknown one issues nothing.
    expect(requested.every((url) => !url.includes('unknown-game'))).toBe(true);
    expect(mods).toEqual([
      {
        id: 'openmw-modder/tamriel-rebuilt',
        gameId: 'openmw',
        name: 'tamriel-rebuilt',
        summary: 'Mainland Morrowind expansion.',
        url: 'https://github.com/modder/tamriel-rebuilt',
        author: 'modder',
        stars: 420,
        updatedAt: '2026-08-01T00:00:00Z',
      },
    ]);
  });

  it('keeps collecting when a search fails', async () => {
    // Every phrase that is not an OpenRCT2 one is rate limited, so the first
    // game contributes nothing and the second still fills in.
    const fetchFn = async (url: string) => {
      if (!url.includes('openrct2')) throw new Error('rate limited');
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: 'a/plugin',
              name: 'plugin',
              description: null,
              html_url: 'https://github.com/a/plugin',
              stargazers_count: 3,
              owner: { login: 'a' },
            },
          ],
        }),
      };
    };

    const mods = await modsModule.collectLiveMods(
      [makeGame('openmw'), makeGame('openrct2')],
      fetchFn,
    );
    expect(mods).toHaveLength(1);
    expect(mods[0].gameId).toBe('openrct2');
    expect(mods[0].summary).toBe('No description published.');
  });

  it('runs several distinct searches per game and dedupes overlapping hits', async () => {
    const queries: string[] = [];
    const fetchFn = async (url: string) => {
      const params = new URL(url).searchParams;
      queries.push(params.get('q') ?? '');
      expect(Number(params.get('per_page'))).toBeLessThanOrEqual(10);
      const index = queries.length;
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: 'popular/everywhere',
              name: 'everywhere',
              description: 'Answers every phrase.',
              html_url: 'https://github.com/popular/everywhere',
              stargazers_count: 100,
              owner: { login: 'popular' },
            },
            {
              full_name: `niche/only-${index}`,
              name: `only-${index}`,
              description: 'Answers one phrase.',
              html_url: `https://github.com/niche/only-${index}`,
              stargazers_count: index,
              owner: { login: 'niche' },
            },
          ],
        }),
      };
    };

    const mods = await modsModule.collectLiveMods([makeGame('openmw')], fetchFn);

    expect(queries.length).toBeGreaterThan(1);
    expect(new Set(queries).size).toBe(queries.length);
    // The vocabulary reaches past the project name into the game's own terms.
    expect(queries.some((query) => query.includes('openmw'))).toBe(true);
    expect(queries.some((query) => !query.includes('openmw'))).toBe(true);
    // The repo returned by every query is listed once; the rest all survive.
    expect(mods.filter((mod) => mod.url === 'https://github.com/popular/everywhere')).toHaveLength(
      1,
    );
    expect(mods).toHaveLength(queries.length + 1);
    expect(new Set(mods.map((mod) => mod.id)).size).toBe(mods.length);
  });

  it('interleaves the searches across games so no game is swept last', async () => {
    const requested: string[] = [];
    const fetchFn = async (url: string) => {
      requested.push(url);
      const index = requested.length;
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: `owner/repo-${index}`,
              name: `repo-${index}`,
              description: 'One answer per request.',
              html_url: `https://github.com/owner/repo-${index}`,
              stargazers_count: index,
              owner: { login: 'owner' },
            },
          ],
        }),
      };
    };

    const gameIds = ['openmw', 'openrct2', 'devilutionx'];
    const mods = await modsModule.collectLiveMods(gameIds.map(makeGame), fetchFn);

    // Each request answers with its own repo, so the mod order is the request
    // order and can be read back as the sequence of games that were searched.
    expect(mods.map((mod) => mod.name)).toEqual(requested.map((_, i) => `repo-${i + 1}`));
    expect(new Set(requested).size).toBe(requested.length);
    expect(requested[0]).toContain('openmw');
    expect(requested[1]).toContain('openrct2');
    expect(requested[2]).toContain('devilutionx');
    // The fourth request opens the second round rather than repeating a game.
    expect(requested[3]).not.toContain('openrct2');
    expect(requested[3]).not.toContain('devilutionx');

    const order = mods.map((mod) => mod.gameId);
    expect(order.length).toBeGreaterThan(gameIds.length);
    expect(order.length % gameIds.length).toBe(0);
    for (let start = 0; start < order.length; start += gameIds.length) {
      expect([...order.slice(start, start + gameIds.length)].sort()).toEqual([...gameIds].sort());
    }
  });

  it('stops the sweep when GitHub rejects a search for exhausting the budget', async () => {
    const requested: string[] = [];
    const fetchFn = async (url: string) => {
      requested.push(url);
      if (requested.length >= 3) {
        return { ok: false, status: 403, json: async () => ({ message: 'rate limit exceeded' }) };
      }
      const index = requested.length;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              full_name: `owner/repo-${index}`,
              name: `repo-${index}`,
              description: 'Collected before the budget ran out.',
              html_url: `https://github.com/owner/repo-${index}`,
              stargazers_count: index,
              owner: { login: 'owner' },
            },
          ],
        }),
      };
    };

    const mods = await modsModule.collectLiveMods(
      [makeGame('openmw'), makeGame('openrct2')],
      fetchFn,
    );

    // The 403 lands on the second round, so nothing is attempted after it.
    expect(requested).toHaveLength(3);
    // Both games still kept the results their leading phrase already returned.
    expect(mods.map((mod) => mod.gameId)).toEqual(['openmw', 'openrct2']);
    expect(mods.map((mod) => mod.name)).toEqual(['repo-1', 'repo-2']);
  });

  it('normalizes mod repository input from URLs and owner/name forms', () => {
    expect(modsModule.normalizeModRepo('owner/mod-pack')).toBe('owner/mod-pack');
    expect(modsModule.normalizeModRepo('https://github.com/Owner/Mod.Pack')).toBe(
      'Owner/Mod.Pack',
    );
    expect(modsModule.normalizeModRepo('https://github.com/owner/pack.git')).toBe('owner/pack');
    expect(modsModule.normalizeModRepo('  github.com/x  ')).toBeNull();
    expect(modsModule.normalizeModRepo('not a repo')).toBeNull();
  });

  it('lists pinned repositories first for their game and dedupes against search', async () => {
    const fetchFn = async (url: string) => {
      if (url === 'https://api.github.com/repos/pinner/custom-mod') {
        return {
          ok: true,
          json: async () => ({
            full_name: 'pinner/custom-mod',
            name: 'custom-mod',
            description: 'Hand-pinned source.',
            html_url: 'https://github.com/pinner/custom-mod',
            pushed_at: '2026-08-10T00:00:00Z',
            stargazers_count: 2,
            owner: { login: 'pinner' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: 'pinner/custom-mod',
              name: 'custom-mod',
              description: 'Hand-pinned source.',
              html_url: 'https://github.com/pinner/custom-mod',
              stargazers_count: 2,
              owner: { login: 'pinner' },
            },
            {
              full_name: 'modder/other',
              name: 'other',
              description: 'Search result.',
              html_url: 'https://github.com/modder/other',
              stargazers_count: 9,
              owner: { login: 'modder' },
            },
          ],
        }),
      };
    };

    const mods = await modsModule.collectLiveMods([makeGame('openmw')], fetchFn, [
      { gameId: 'openmw', repo: 'pinner/custom-mod' },
      { gameId: 'not-listed-game', repo: 'skipped/entirely' },
    ]);
    expect(mods[0].name).toBe('custom-mod');
    expect(mods[0].author).toBe('pinner');
    // The same repo surfacing in search does not duplicate the pinned card.
    expect(mods.filter((mod) => mod.url.includes('custom-mod'))).toHaveLength(1);
    expect(mods.some((mod) => mod.name === 'other')).toBe(true);
  });

  it('round-trips pinned repositories through storage', () => {
    const sources = [{ gameId: 'openmw', repo: 'pinner/custom-mod' }];
    modsModule.saveModRepos(sources);
    expect(modsModule.getModRepos()).toEqual(sources);
    modsModule.saveModRepos([]);
    expect(modsModule.getModRepos()).toEqual([]);
  });
});
