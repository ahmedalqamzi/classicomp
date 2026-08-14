import { useEffect, useMemo, useState } from 'react';
import { seedState } from './data/seed';
import { reduceAppState, selectVisibleLibrary } from './domain/state';
import type { AppRoute, AppState } from './domain/types';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';
import { AppHeader } from './ui/app-header';
import { CatalogView } from './ui/catalog-view';
import { DownloadsBar } from './ui/downloads-bar';
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
  const [downloadsOpen, setDownloadsOpen] = useState(false);

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
    setDownloadsOpen(false);
    applyBridgeResult(await activeBridge.signOut());
  }

  async function queueInstall(gameId: string) {
    applyBridgeResult(await activeBridge.queueInstall(gameId));
    setDownloadsOpen(true);
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
      </section>

      <DownloadsBar
        downloads={downloadsForProfile}
        games={viewState.games}
        open={downloadsOpen}
        onToggle={setDownloadsOpen}
      />
    </main>
  );
}
