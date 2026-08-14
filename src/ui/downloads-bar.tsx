import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Download, Game } from '../domain/types';
import { GameIcon } from './game-icon';

interface DownloadsBarProps {
  downloads: Download[];
  games: Game[];
  open: boolean;
  onToggle(open: boolean): void;
}

export function DownloadsBar({ downloads, games, open, onToggle }: DownloadsBarProps) {
  const current = downloads[0];
  const currentGame = current
    ? games.find((game) => game.id === current.gameId)
    : undefined;

  return (
    <footer className="downloads-area">
      {open && downloads.length > 0 ? (
        <div aria-label="Download queue" className="downloads-panel">
          <div className="download-list">
            {downloads.map((download) => {
              const game = games.find((item) => item.id === download.gameId);
              if (!game) return null;
              return (
                <article className="download-row" key={download.id}>
                  <GameIcon game={game} />
                  <div>
                    <h3>{game.title}</h3>
                    <p>Waiting for a verified install recipe</p>
                  </div>
                  <span>{download.state}</span>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="downloads-bar" role="status">
        <span className="downloads-label">
          Downloads{downloads.length > 0 ? ` (${downloads.length})` : ''}
        </span>
        {current && currentGame ? (
          <>
            <span className="downloads-current">{currentGame.title}</span>
            <span aria-hidden="true" className="downloads-progress">
              <span style={{ width: `${current.progress}%` }} />
            </span>
            <span className="downloads-state">{current.state}</span>
            <button
              aria-expanded={open}
              className="downloads-toggle"
              type="button"
              onClick={() => onToggle(!open)}
            >
              {open ? (
                <ChevronDown aria-hidden="true" size={13} />
              ) : (
                <ChevronUp aria-hidden="true" size={13} />
              )}
              {open ? 'Hide queue' : 'View queue'}
            </button>
          </>
        ) : (
          <span className="downloads-empty">No active downloads</span>
        )}
      </div>
    </footer>
  );
}
