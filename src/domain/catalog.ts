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
