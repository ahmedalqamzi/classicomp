import type { Game } from '../domain/types';
import { capsuleGradient } from './store-game-page';

export function GameIcon({ game }: { game: Game }) {
  return (
    <span
      className="game-icon"
      style={game.iconUrl ? undefined : { background: capsuleGradient(game.shortTitle) }}
    >
      {game.iconUrl ? (
        <img
          alt=""
          src={game.iconUrl}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <span aria-hidden="true">{game.title.charAt(0)}</span>
    </span>
  );
}
