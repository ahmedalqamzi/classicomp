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
