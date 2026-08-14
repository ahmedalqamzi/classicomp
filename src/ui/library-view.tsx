import {
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  Search,
} from 'lucide-react';
import { useMemo } from 'react';
import type { Game, LibraryEntry } from '../domain/types';
import { GameIcon } from './game-icon';

interface LibraryViewProps {
  entries: LibraryEntry[];
  games: Game[];
  selectedGameId: string;
  hasCloudProvider: boolean;
  onSelectGame(gameId: string): void;
  onQueueInstall(gameId: string): void;
}

export function LibraryView({
  entries,
  games,
  selectedGameId,
  hasCloudProvider,
  onSelectGame,
  onQueueInstall,
}: LibraryViewProps) {
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? games[0];
  return (
    <>
      <LibrarySidebar
        entries={entries}
        games={games}
        selectedGameId={selectedGame.id}
        onSelectGame={onSelectGame}
      />
      <GameDetail
        entry={entries.find((item) => item.gameId === selectedGame.id)}
        game={selectedGame}
        hasCloudProvider={hasCloudProvider}
        onQueueInstall={onQueueInstall}
      />
    </>
  );
}

interface LibrarySidebarProps {
  entries: LibraryEntry[];
  games: Game[];
  selectedGameId: string;
  onSelectGame(gameId: string): void;
}

function LibrarySidebar({ entries, games, selectedGameId, onSelectGame }: LibrarySidebarProps) {
  const libraryRows = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          game: games.find((game) => game.id === entry.gameId),
        }))
        .filter((row): row is { entry: LibraryEntry; game: Game } => Boolean(row.game)),
    [entries, games],
  );
  const installedRows = libraryRows.filter(({ entry }) => entry.installState === 'installed');
  const availableRows = libraryRows.filter(({ entry }) => entry.installState !== 'installed');

  function renderRows(rows: typeof libraryRows) {
    return rows.map(({ entry, game }) => (
      <button
        aria-current={selectedGameId === game.id ? 'page' : undefined}
        className="library-row"
        key={game.id}
        type="button"
        onClick={() => onSelectGame(game.id)}
      >
        <GameIcon game={game} />
        <span>{game.title}</span>
        <LibraryStateIcon state={entry.installState} />
      </button>
    ));
  }

  return (
    <aside className="library-rail" aria-label="Library games">
      <label className="search-field">
        <Search aria-hidden="true" size={15} />
        <input aria-label="Search library" placeholder="Search" type="search" />
      </label>
      <div className="library-list">
        {installedRows.length > 0 ? (
          <section aria-labelledby="installed-games-heading">
            <h2 id="installed-games-heading">Installed</h2>
            {renderRows(installedRows)}
          </section>
        ) : null}
        <section aria-labelledby="not-installed-games-heading">
          <h2 id="not-installed-games-heading">Not installed</h2>
          {renderRows(availableRows)}
        </section>
      </div>
      <div className="library-count">{libraryRows.length} games</div>
    </aside>
  );
}

function LibraryStateIcon({ state }: { state: LibraryEntry['installState'] }) {
  if (state === 'installed') return <Check aria-label="Installed" size={12} />;
  if (state === 'queued' || state === 'downloading') {
    return <Clock3 aria-label={state === 'queued' ? 'Queued' : 'Downloading'} size={12} />;
  }
  return <Download aria-label="Available to install" size={12} />;
}

interface GameDetailProps {
  entry?: LibraryEntry;
  game: Game;
  hasCloudProvider: boolean;
  onQueueInstall(gameId: string): void;
}

function GameDetail({ entry, game, hasCloudProvider, onQueueInstall }: GameDetailProps) {
  const installState = entry?.installState ?? 'available';
  const actionLabel =
    installState === 'installed' ? 'Play' : installState === 'queued' ? 'Queued' : 'Queue install';

  return (
    <article className="game-detail">
      <div className="game-hero">
        {game.artworkUrl ? (
          <img
            alt=""
            src={game.artworkUrl}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
        <div className="game-hero-copy">
          <h2>{game.title}</h2>
          <p>{game.summary}</p>
        </div>
      </div>

      <div className="action-bar">
        <button
          className="primary-action"
          disabled={installState === 'queued'}
          type="button"
          onClick={() => onQueueInstall(game.id)}
        >
          {installState === 'installed' ? null : <Download aria-hidden="true" size={17} />}
          {actionLabel}
        </button>
        <span>Version {game.version}</span>
        <span>{game.runtime}</span>
        <a href={game.upstreamUrl} rel="noreferrer" target="_blank">
          Upstream <ExternalLink aria-hidden="true" size={11} />
        </a>
        <span className="cloud-mini-status">
          {hasCloudProvider ? <Cloud aria-hidden="true" size={13} /> : <CloudOff aria-hidden="true" size={13} />}
          {hasCloudProvider ? 'Provider configured' : 'Local only'}
        </span>
      </div>

      <div className="detail-layout">
        <section className="about-panel">
          <h3>About</h3>
          <p>{game.description}</p>
          {game.executablePath ? null : (
            <p className="recipe-note">A verified install recipe is not available yet.</p>
          )}
        </section>
        <aside className="metadata-panel" aria-label="Game information">
          <h3>Game information</h3>
          <dl>
            <div><dt>Install state</dt><dd>{installState === 'available' ? 'Not installed' : installState}</dd></div>
            <div><dt>Install path</dt><dd>{entry?.installPath ?? 'Not installed'}</dd></div>
            <div><dt>Executable</dt><dd>{game.executablePath ?? 'Not installed'}</dd></div>
            <div><dt>Version</dt><dd>{game.version}</dd></div>
            <div><dt>Runtime</dt><dd>{game.runtime}</dd></div>
            <div><dt>Play time</dt><dd>{entry?.playMinutes ? `${entry.playMinutes} min` : 'Never played'}</dd></div>
            <div><dt>Cloud saves</dt><dd>{hasCloudProvider ? 'Provider configured' : 'Local only'}</dd></div>
          </dl>
        </aside>
      </div>
    </article>
  );
}
