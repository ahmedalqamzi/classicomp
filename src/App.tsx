import {
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { seedState } from './data/seed';
import { reduceAppState, selectGame, selectVisibleLibrary } from './domain/state';
import type { AppRoute, AppState, Game, LibraryEntry, Profile } from './domain/types';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';

interface AppProps {
  bridge?: PlatformBridge;
}

export function App({ bridge }: AppProps) {
  const activeBridge = useMemo(
    () => bridge ?? createDefaultBridge(),
    [bridge],
  );
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    let mounted = true;
    activeBridge.loadState().then((loaded) => {
      if (mounted) setState(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [activeBridge]);

  const viewState = state ?? seedState;
  const selectedGame = selectGame(viewState, viewState.selectedGameId) ?? viewState.games[0];
  const activeProfile =
    viewState.profiles.find((profile) => profile.id === viewState.activeProfileId) ??
    viewState.profiles[0];
  const activeLibrary = selectVisibleLibrary(viewState);
  const downloadsForProfile = viewState.downloads.filter(
    (download) => download.profileId === viewState.activeProfileId,
  );

  function changeRoute(route: AppRoute) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'route/change', route }));
  }

  function selectLibraryGame(gameId: string) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'game/select', gameId }));
  }

  async function activateProfile(profileId: string) {
    setState(await activeBridge.setActiveProfile(profileId));
  }

  async function queueInstall(gameId: string) {
    setState(await activeBridge.queueInstall(gameId));
  }

  return (
    <main className="app-shell">
      <AppHeader
        activeProfile={activeProfile}
        downloadsCount={downloadsForProfile.length}
        profiles={viewState.profiles}
        route={viewState.route}
        onActivateProfile={activateProfile}
        onChangeRoute={changeRoute}
      />

      <section className="app-body">
        {viewState.route === 'library' ? (
          <>
            <LibrarySidebar
              entries={activeLibrary}
              games={viewState.games}
              selectedGameId={viewState.selectedGameId}
              onSelectGame={selectLibraryGame}
            />
            <GameDetail
              entry={activeLibrary.find((item) => item.gameId === selectedGame.id)}
              game={selectedGame}
              hasCloudProvider={Boolean(viewState.cloudProvider)}
              onQueueInstall={queueInstall}
            />
          </>
        ) : null}

        {viewState.route === 'catalog' ? (
          <CatalogView
            games={viewState.games}
            library={activeLibrary}
            onQueueInstall={queueInstall}
          />
        ) : null}

        {viewState.route === 'downloads' ? (
          <DownloadsView downloads={downloadsForProfile} games={viewState.games} />
        ) : null}
      </section>

      <StatusStrip downloadsCount={downloadsForProfile.length} profileName={activeProfile.displayName} />
    </main>
  );
}

interface HeaderProps {
  activeProfile: Profile;
  downloadsCount: number;
  profiles: Profile[];
  route: AppRoute;
  onActivateProfile(profileId: string): void;
  onChangeRoute(route: AppRoute): void;
}

function AppHeader({
  activeProfile,
  downloadsCount,
  profiles,
  route,
  onActivateProfile,
  onChangeRoute,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <h1>CLASSICOMP</h1>
      </div>

      <nav aria-label="Primary" className="primary-tabs" role="tablist">
        <button
          aria-selected={route === 'library'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('library')}
        >
          Library
        </button>
        <button
          aria-selected={route === 'catalog'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('catalog')}
        >
          Catalog
        </button>
        <button
          aria-selected={route === 'downloads'}
          role="tab"
          type="button"
          onClick={() => onChangeRoute('downloads')}
        >
          Downloads{downloadsCount > 0 ? ` (${downloadsCount})` : ''}
        </button>
      </nav>

      <label className="profile-menu">
        <span>
          <UserRound aria-hidden="true" size={15} />
          {activeProfile.avatarInitials}
        </span>
        <select
          aria-label="Active profile"
          value={activeProfile.id}
          onChange={(event) => onActivateProfile(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>
      </label>
    </header>
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

interface CatalogViewProps {
  games: Game[];
  library: LibraryEntry[];
  onQueueInstall(gameId: string): void;
}

function CatalogView({ games, library, onQueueInstall }: CatalogViewProps) {
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

interface DownloadsViewProps {
  downloads: AppState['downloads'];
  games: Game[];
}

function DownloadsView({ downloads, games }: DownloadsViewProps) {
  return (
    <section className="downloads-view" aria-labelledby="downloads-heading">
      <div className="view-heading">
        <h2 id="downloads-heading">Downloads</h2>
      </div>
      {downloads.length === 0 ? (
        <p className="empty-state">Nothing queued.</p>
      ) : (
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
      )}
    </section>
  );
}

function StatusStrip({ downloadsCount, profileName }: { downloadsCount: number; profileName: string }) {
  return (
    <footer className="status-strip" role="status">
      <span>{downloadsCount === 0 ? 'Ready' : `${downloadsCount} queued`}</span>
      <span className="status-profile">{profileName}</span>
    </footer>
  );
}

function GameIcon({ game }: { game: Game }) {
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
