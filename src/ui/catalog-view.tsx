import type { Game, LibraryEntry } from '../domain/types';
import { GameIcon } from './game-icon';

interface CatalogViewProps {
  games: Game[];
  library: LibraryEntry[];
  onQueueInstall(gameId: string): void;
}

export function CatalogView({ games, library, onQueueInstall }: CatalogViewProps) {
  return (
    <section className="catalog-view" aria-labelledby="catalog-heading">
      <div className="view-heading">
        <h2 id="catalog-heading">Catalog</h2>
      </div>
      <div className="catalog-table">
        {games.map((game) => {
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
    </section>
  );
}
