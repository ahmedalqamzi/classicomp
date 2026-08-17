import {
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  Play,
  Search,
  Settings,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { prerequisiteForGame } from '../domain/prerequisites';
import { libraryGameId } from '../domain/tracking';
import type { Game, LibraryEntry, TrackedProject } from '../domain/types';
import { formatPlayTime, installStateLabel } from './format';
import { GameContextMenu } from './game-context-menu';
import { GamePropertiesDialog, RomSetupDialog, UninstallDialog } from './game-dialogs';
import { GameIcon } from './game-icon';


// Linking an original copy is offered, never demanded. The earlier rule
// blocked Play on every single game, which was wrong twice over: these builds
// carry their own first-run flow — Zelda 64 Recompiled, Ship of Harkinian and
// OpenMW all ask for game data themselves, in their own UI, and know far more
// about what they need than Classicomp does — and source ports like OpenTTD
// and OpenRCT2 run on free replacement assets with no original copy at all.
// Gating Play on a link Classicomp cannot verify only stopped people playing
// games that were ready to run. So Set up stays available as an optional
// record of where a ROM lives, and Play is gated on being installed, nothing
// more.

interface LibraryViewProps {
  entries: LibraryEntry[];
  games: Game[];
  selectedGameId: string;
  hasCloudProvider: boolean;
  trackedProjects?: TrackedProject[];
  onSelectGame(gameId: string): void;
  onQueueInstall(gameId: string): void;
  onBrowseStore(): void;
  onUninstall?(gameId: string): void;
  onSetGameRom?(gameId: string, romPath: string | null): void;
  onPlay?(gameId: string): void;
  onInstallBuild?(gameId: string): void;
  installingGameId?: string | null;
  // Why the last Play click did nothing, shown in the action bar.
  launchError?: string | null;
  onDismissLaunchError?(): void;
}

interface MenuState {
  gameId: string;
  x: number;
  y: number;
  opener: HTMLElement | null;
}

type GameDialog = {
  kind: 'properties' | 'uninstall' | 'rom';
  gameId: string;
  opener: HTMLElement | null;
} | null;

export function LibraryView({
  entries,
  games,
  selectedGameId,
  hasCloudProvider,
  trackedProjects,
  onSelectGame,
  onQueueInstall,
  onBrowseStore,
  onUninstall,
  onSetGameRom,
  onPlay,
  onInstallBuild,
  installingGameId,
  launchError,
  onDismissLaunchError,
}: LibraryViewProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<GameDialog>(null);

  // Accounts start empty; the store is the only way games enter the library.
  if (entries.length === 0) {
    return (
      <section className="library-empty" aria-labelledby="library-empty-heading">
        <h2 id="library-empty-heading">Your library is empty</h2>
        <p>Games you download from the Store appear here.</p>
        <button type="button" onClick={onBrowseStore}>
          Browse the Store
        </button>
      </section>
    );
  }

  const ownedGames = games.filter((game) =>
    entries.some((entry) => entry.gameId === game.id),
  );
  const selectedGame =
    ownedGames.find((game) => game.id === selectedGameId) ?? ownedGames[0];

  function openMenuAt(gameId: string, x: number, y: number, opener: HTMLElement | null) {
    setMenu({ gameId, x, y, opener });
  }

  const menuGame = menu ? games.find((game) => game.id === menu.gameId) : undefined;
  const dialogGame = dialog ? games.find((game) => game.id === dialog.gameId) : undefined;

  return (
    <>
      <LibrarySidebar
        entries={entries}
        games={games}
        selectedGameId={selectedGame.id}
        onSelectGame={onSelectGame}
        onOpenMenu={openMenuAt}
      />
      <GameDetail
        entry={entries.find((item) => item.gameId === selectedGame.id)}
        game={selectedGame}
        hasCloudProvider={hasCloudProvider}
        trackedProjects={trackedProjects}
        onQueueInstall={onQueueInstall}
        onOpenMenu={openMenuAt}
        launchError={launchError}
        onDismissLaunchError={onDismissLaunchError}
        installingGameId={installingGameId}
        onInstallBuild={(gameId) => onInstallBuild?.(gameId)}
        onPlay={(gameId) => onPlay?.(gameId)}
        onSetUpRom={(gameId, opener) => setDialog({ kind: 'rom', gameId, opener })}
        onShowProperties={(gameId, opener) =>
          setDialog({ kind: 'properties', gameId, opener })
        }
      />
      {menu && menuGame ? (
        <GameContextMenu
          gameTitle={menuGame.title}
          position={{ x: menu.x, y: menu.y }}
          returnFocusTo={menu.opener}
          onClose={() => setMenu(null)}
          onReinstall={
            entries.find((item) => item.gameId === menu.gameId)?.downloadedFile
              ? () => {
                  onInstallBuild?.(menu.gameId);
                  setMenu(null);
                }
              : undefined
          }
          onSetUpRom={() => {
            setDialog({ kind: 'rom', gameId: menu.gameId, opener: menu.opener });
            setMenu(null);
          }}
          onProperties={() => {
            setDialog({ kind: 'properties', gameId: menu.gameId, opener: menu.opener });
            setMenu(null);
          }}
          onUninstall={() => {
            setDialog({ kind: 'uninstall', gameId: menu.gameId, opener: menu.opener });
            setMenu(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'uninstall' && dialogGame ? (
        <UninstallDialog
          gameTitle={dialogGame.title}
          returnFocusTo={dialog.opener}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            onUninstall?.(dialogGame.id);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'rom' && dialogGame ? (
        <RomSetupDialog
          entry={entries.find((item) => item.gameId === dialogGame.id)}
          game={dialogGame}
          prerequisite={prerequisiteForGame(dialogGame.id, trackedProjects ?? [])}
          project={trackedProjects?.find((project) => libraryGameId(project) === dialogGame.id)}
          returnFocusTo={dialog.opener}
          onClose={() => setDialog(null)}
          onLink={(romPath) => {
            onSetGameRom?.(dialogGame.id, romPath);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'properties' && dialogGame ? (
        <GamePropertiesDialog
          entry={entries.find((item) => item.gameId === dialogGame.id)}
          game={dialogGame}
          project={trackedProjects?.find((project) => libraryGameId(project) === dialogGame.id)}
          returnFocusTo={dialog.opener}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

interface LibrarySidebarProps {
  entries: LibraryEntry[];
  games: Game[];
  selectedGameId: string;
  onSelectGame(gameId: string): void;
  onOpenMenu(gameId: string, x: number, y: number, opener: HTMLElement | null): void;
}

function LibrarySidebar({ entries, games, selectedGameId, onSelectGame, onOpenMenu }: LibrarySidebarProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const libraryRows = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          game: games.find((game) => game.id === entry.gameId),
        }))
        .filter((row): row is { entry: LibraryEntry; game: Game } => Boolean(row.game))
        .sort((left, right) => left.game.title.localeCompare(right.game.title)),
    [entries, games],
  );
  const trimmedQuery = query.trim().toLowerCase();
  const visibleRows = trimmedQuery
    ? libraryRows.filter(({ game }) => game.title.toLowerCase().includes(trimmedQuery))
    : libraryRows;

  return (
    <aside className="library-rail" aria-label="Library games">
      <label className="search-field">
        <Search aria-hidden="true" size={15} />
        <input
          aria-label="Search library"
          placeholder="Search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="library-list">
        <button
          aria-expanded={!collapsed}
          className="library-list-header"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronDown aria-hidden="true" size={12} />
          All games ({libraryRows.length})
        </button>
        {collapsed ? null : visibleRows.length === 0 ? (
          <p className="library-no-matches">No games match your search.</p>
        ) : (
          visibleRows.map(({ entry, game }) => (
            <button
              aria-current={selectedGameId === game.id ? 'page' : undefined}
              className="library-row"
              key={game.id}
              type="button"
              onClick={() => onSelectGame(game.id)}
              onContextMenu={(event) => {
                // Steam selects the row on right-click before showing its menu.
                event.preventDefault();
                onSelectGame(game.id);
                onOpenMenu(game.id, event.clientX, event.clientY, event.currentTarget);
              }}
            >
              <GameIcon game={game} />
              <span>{game.title}</span>
              <LibraryStateIcon state={entry.installState} />
            </button>
          ))
        )}
      </div>
      <div className="library-count">{libraryRows.length} games</div>
    </aside>
  );
}

function LibraryStateIcon({ state }: { state: LibraryEntry['installState'] }) {
  if (state === 'installed') return <Check aria-label="Installed" size={12} />;
  if (state === 'downloaded') return <Download aria-label="Downloaded" size={12} />;
  if (state === 'queued' || state === 'downloading') {
    return <Clock3 aria-label={state === 'queued' ? 'Queued' : 'Downloading'} size={12} />;
  }
  return <Download aria-label="Available to install" size={12} />;
}

interface GameDetailProps {
  entry?: LibraryEntry;
  game: Game;
  hasCloudProvider: boolean;
  trackedProjects?: TrackedProject[];
  onQueueInstall(gameId: string): void;
  onPlay(gameId: string): void;
  onInstallBuild(gameId: string): void;
  installingGameId?: string | null;
  onSetUpRom(gameId: string, opener: HTMLElement): void;
  launchError?: string | null;
  onDismissLaunchError?(): void;
  onOpenMenu(gameId: string, x: number, y: number, opener: HTMLElement | null): void;
  onShowProperties(gameId: string, opener: HTMLElement): void;
}

function GameDetail({ entry, game, hasCloudProvider, trackedProjects, onQueueInstall, onPlay, onInstallBuild, installingGameId, onSetUpRom, onOpenMenu, onShowProperties, launchError, onDismissLaunchError }: GameDetailProps) {
  const installState = entry?.installState ?? 'available';
  // Once the build is on disk the primary action is Play, not a detour. The
  // one thing that can still block it is the game content itself: a
  // recompilation ships no assets, so it cannot run until the player links
  // their own original copy. That gets its own button beside Play rather than
  // replacing it, so the state reads as "one step left", not "wrong button".
  // Three things stand between a store click and a running game, and each one
  // gets its own button so the bar shows what is done and what is left:
  // download the artifact, install it (unpack, register with Flatpak, find the
  // executable), and link the original copy the recompilation needs. Play is
  // last and stays visible throughout, greyed while anything is outstanding.
  const project = trackedProjects?.find((candidate) => libraryGameId(candidate) === game.id);
  const downloaded = installState === 'downloaded' || installState === 'installed';
  const installed = installState === 'installed' && Boolean(entry?.installPath);
  const needsInstall = downloaded && !installed;
  const installing = installingGameId === game.id;
  // Set up returns as a real gate, but only for the handful of builds that
  // genuinely cannot ask for the original game themselves. Everything else
  // opens its own picker on first run, where the game knows what it needs.
  const prerequisite = prerequisiteForGame(game.id, trackedProjects ?? []);
  const needsRom = installed && prerequisite !== null && !entry?.romPath;
  const actionLabel = downloaded
    ? 'Play'
    : installState === 'queued'
      ? 'Queued'
      : installState === 'downloading'
        ? 'Downloading…'
        : 'Install';
  const blockedReason = !downloaded
    ? null
    : needsInstall
      ? `Install ${game.title} first`
      : needsRom
        ? `${game.title} needs ${prerequisite?.label ?? 'your original copy'} — use Set up`
        : null;
  const actionDisabled =
    installState === 'queued' ||
    installState === 'downloading' ||
    installing ||
    blockedReason !== null;
  const playMinutes = entry?.playMinutes ?? 0;
  // Steam's library hero is key art with a gradient, not a stretched
  // gameplay screenshot: prefer the tracked project's cover art.
  const heroUrl =
    trackedProjects?.find((project) => project.gameId === game.id)?.coverUrl ??
    game.artworkUrl;

  return (
    <article className="game-detail">
      <div
        className="game-hero"
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenMenu(game.id, event.clientX, event.clientY, event.currentTarget);
        }}
      >
        {heroUrl ? (
          <img
            alt=""
            src={heroUrl}
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
          disabled={actionDisabled}
          title={blockedReason ?? undefined}
          type="button"
          onClick={() => (downloaded ? onPlay(game.id) : onQueueInstall(game.id))}
        >
          {downloaded ? (
            <Play aria-hidden="true" size={16} />
          ) : (
            <Download aria-hidden="true" size={16} />
          )}
          {actionLabel}
        </button>
        {launchError ? (
          <button
            className="launch-error"
            title="Dismiss"
            type="button"
            onClick={() => onDismissLaunchError?.()}
          >
            {launchError}
          </button>
        ) : null}
        {needsInstall ? (
          <button
            className="setup-action"
            disabled={installing}
            type="button"
            onClick={() => onInstallBuild(game.id)}
          >
            <Download aria-hidden="true" size={15} />
            {installing ? 'Installing…' : 'Install'}
          </button>
        ) : null}
        {needsRom ? (
          <button
            className="setup-action"
            type="button"
            onClick={(event) => onSetUpRom(game.id, event.currentTarget)}
          >
            <Wrench aria-hidden="true" size={15} />
            Set up
          </button>
        ) : null}

        <span>Version {game.version}</span>
        <span>{game.runtime}</span>
        <a href={game.upstreamUrl} rel="noreferrer" target="_blank">
          Upstream <ExternalLink aria-hidden="true" size={11} />
        </a>
        <span className="cloud-mini-status">
          {hasCloudProvider ? <Cloud aria-hidden="true" size={13} /> : <CloudOff aria-hidden="true" size={13} />}
          {hasCloudProvider ? 'Provider configured' : 'Local only'}
        </span>
        <button
          aria-label={`${game.title} options`}
          className="game-options"
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenMenu(game.id, rect.left, rect.bottom + 4, event.currentTarget);
          }}
        >
          <Settings aria-hidden="true" size={14} />
        </button>
      </div>

      <div className="game-stats">
        <div className="game-stat">
          <span className="game-stat-label">Play time</span>
          <span className="game-stat-value">{formatPlayTime(playMinutes)}</span>
        </div>
        <div className="game-stat">
          <span className="game-stat-label">Install state</span>
          <span className="game-stat-value">{installStateLabel(installState)}</span>
        </div>
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
            <div><dt>Install state</dt><dd>{installStateLabel(installState)}</dd></div>
            <div><dt>Install path</dt><dd>{entry?.installPath ?? (installState === 'downloaded' ? 'Not set up — file is in your downloads folder' : 'Not installed')}</dd></div>
            <div><dt>Executable</dt><dd>{game.executablePath ?? 'Not set up'}</dd></div>
            <div><dt>Version</dt><dd>{game.version}</dd></div>
            <div><dt>Runtime</dt><dd>{game.runtime}</dd></div>
            <div><dt>Play time</dt><dd>{formatPlayTime(playMinutes)}</dd></div>
            <div><dt>Cloud saves</dt><dd>{hasCloudProvider ? 'Provider configured' : 'Local only'}</dd></div>
          </dl>
        </aside>
      </div>
    </article>
  );
}
