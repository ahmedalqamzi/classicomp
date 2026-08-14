import type { Game } from '../domain/types';

export function GameIcon({ game }: { game: Game }) {
  return (
    <span className="game-icon">
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
