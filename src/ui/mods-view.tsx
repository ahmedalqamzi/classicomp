import type { Game, Mod } from '../domain/types';
import { GameIcon } from './game-icon';

interface ModsViewProps {
  games: Game[];
  mods: Mod[];
  onToggleMod(modId: string): void;
}

export function ModsView({ games, mods, onToggleMod }: ModsViewProps) {
  const sections = games
    .map((game) => ({ game, gameMods: mods.filter((mod) => mod.gameId === game.id) }))
    .filter((section) => section.gameMods.length > 0);

  return (
    <section className="mods-view" aria-labelledby="mods-heading">
      <div className="view-heading">
        <h2 id="mods-heading">Mods</h2>
      </div>
      {sections.map(({ game, gameMods }) => (
        <section className="mods-game" key={game.id} aria-labelledby={`mods-${game.id}`}>
          <h3 id={`mods-${game.id}`}>
            <GameIcon game={game} />
            {game.title}
          </h3>
          <div className="mods-table">
            {gameMods.map((mod) => (
              <article className="mod-row" key={mod.id}>
                <div>
                  <h4>{mod.name}</h4>
                  <p>{mod.summary}</p>
                </div>
                <span>{mod.version}</span>
                <span>{mod.author}</span>
                <button
                  aria-checked={mod.enabled}
                  aria-label={`Toggle ${mod.name}`}
                  className="mod-toggle"
                  role="switch"
                  type="button"
                  onClick={() => onToggleMod(mod.id)}
                >
                  <span className="mod-toggle-knob" />
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
