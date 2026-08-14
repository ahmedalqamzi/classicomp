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
