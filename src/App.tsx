import { useEffect, useMemo, useState } from 'react';
import { seedState } from './data/seed';
import { reduceAppState, selectVisibleLibrary } from './domain/state';
import type { AppRoute, AppState, Game } from './domain/types';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';
import { AppHeader } from './ui/app-header';
import { CatalogView } from './ui/catalog-view';
import { GameIcon } from './ui/game-icon';
import { LibraryView } from './ui/library-view';
import { SignInView } from './ui/sign-in-view';

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
  const activeProfile = viewState.profiles.find(
    (profile) => profile.id === viewState.activeProfileId,
  );

  function changeRoute(route: AppRoute) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'route/change', route }));
  }

  function selectLibraryGame(gameId: string) {
    setState((current) => reduceAppState(current ?? viewState, { type: 'game/select', gameId }));
  }

  // Bridge mutations re-reduce from persisted state, which lags the in-memory
  // route and selection; adopt the persisted domain fields but keep those two.
  function applyBridgeResult(next: AppState) {
    setState((current) =>
      current === null
        ? next
        : { ...next, route: current.route, selectedGameId: current.selectedGameId },
    );
  }

  async function activateProfile(profileId: string) {
    const next = await activeBridge.setActiveProfile(profileId);
    setState((current) => (current === null ? next : { ...next, route: current.route }));
  }

  async function signOut() {
    applyBridgeResult(await activeBridge.signOut());
  }

  async function queueInstall(gameId: string) {
    applyBridgeResult(await activeBridge.queueInstall(gameId));
  }

  if (!activeProfile) {
    return <SignInView profiles={viewState.profiles} onSignIn={activateProfile} />;
  }

  const activeLibrary = selectVisibleLibrary(viewState);
  const downloadsForProfile = viewState.downloads.filter(
    (download) => download.profileId === viewState.activeProfileId,
  );

  return (
    <main className="app-shell">
      <AppHeader
        activeProfile={activeProfile}
        profiles={viewState.profiles}
        route={viewState.route}
        onActivateProfile={activateProfile}
        onChangeRoute={changeRoute}
        onSignOut={signOut}
      />

      <section className="app-body">
        {viewState.route === 'library' ? (
          <LibraryView
            entries={activeLibrary}
            games={viewState.games}
            selectedGameId={viewState.selectedGameId}
            hasCloudProvider={Boolean(viewState.cloudProvider)}
            onSelectGame={selectLibraryGame}
            onQueueInstall={queueInstall}
          />
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
