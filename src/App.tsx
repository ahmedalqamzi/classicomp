import { useEffect, useMemo, useRef, useState } from 'react';
import { seedState } from './data/seed';
import { prerequisiteForGame } from './domain/prerequisites';
import { reduceAppState, selectVisibleLibrary, selectVisibleMods } from './domain/state';
import {
  AVAILABILITY_LABELS,
  gameFromTrackedProject,
  groupTrackedProjects,
  isStorefrontReady,
  libraryGameId,
  selectWatchedGameKeys,
  updateAvailable,
} from './domain/tracking';
import type { AppRoute, AppState, DownloadAsset, Friend, LiveMod, TrackedProject } from './domain/types';
import {
  accountClient,
  addFriend as accountAddFriend,
  currentSession,
  fetchFriends,
  getAccountConfig,
  saveAccountConfig,
  signIn as accountSignIn,
  signOut as accountSignOut,
  syncWishlist,
} from './platform/account';
import type { AccountSession } from './platform/account';
import type { PlatformBridge } from './platform/bridge';
import { createDefaultBridge } from './platform/default-bridge';
import { downloadAssetFile, pickBestAsset } from './platform/downloader';
import type { DownloadProgressEvent } from './platform/downloader';
import { collectLiveMods } from './platform/mods-collector';
import { discoverNewProjects } from './platform/project-discovery';
import {
  installDownloadedBuild,
  probeWine,
  removeInstalledBuild,
  runGameSetup,
  runInstalledBuild,
} from './platform/shell';
import { collectTrackingUpdates, selectScanBatch } from './platform/tracking-collector';
import { AppHeader } from './ui/app-header';
import { DownloadsBar } from './ui/downloads-bar';
import { FriendsPanel } from './ui/friends-panel';
import { SignInDialog } from './ui/sign-in-dialog';
import { LibraryView } from './ui/library-view';
import { RoadmapView } from './ui/roadmap-view';
import { ModsView } from './ui/mods-view';
import { SignInView } from './ui/sign-in-view';
import { StoreView } from './ui/store-view';

// The store refreshes twice daily, mirroring the Classic Game Ports tracker;
// a start-up catch-up scan runs when the last one is older than that. While
// never-checked catalog entries remain, catch-up scans are allowed more often
// (still spaced to respect anonymous API rate limits) so the initial fill
// completes across a few launches.
const TRACKING_SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000;
const INITIAL_FILL_INTERVAL_MS = 35 * 60 * 1000;

interface AppProps {
  bridge?: PlatformBridge;
  collectUpdates?: typeof collectTrackingUpdates;
  discoverProjects?: typeof discoverNewProjects;
  collectMods?: typeof collectLiveMods;
}

export function App({ bridge, collectUpdates, discoverProjects, collectMods }: AppProps) {
  const activeBridge = useMemo(
    () => bridge ?? createDefaultBridge(),
    [bridge],
  );
  const collect = collectUpdates ?? collectTrackingUpdates;
  const discover = discoverProjects ?? discoverNewProjects;
  const collectModsFn = collectMods ?? collectLiveMods;
  const [state, setState] = useState<AppState | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  // A clicked release notice deep-links to that game's store page.
  const [noticeFocusGameKey, setNoticeFocusGameKey] = useState<string | null>(null);
  const [storeHomeNonce, setStoreHomeNonce] = useState(0);

  // Steam-style back/forward: an in-memory stack of visited surfaces (tab, or
  // a game page inside the store). Applying a history entry never re-pushes.
  const navStack = useRef<Array<{ route: AppRoute; gameKey: string | null }>>([
    { route: 'store', gameKey: null },
  ]);
  const navIndex = useRef(0);
  const [, setNavVersion] = useState(0);
  const applyingNav = useRef(false);

  function pushNav(entry: { route: AppRoute; gameKey: string | null }) {
    if (applyingNav.current) return;
    const stack = navStack.current.slice(0, navIndex.current + 1);
    const top = stack[stack.length - 1];
    if (top && top.route === entry.route && top.gameKey === entry.gameKey) return;
    stack.push(entry);
    navStack.current = stack;
    navIndex.current = stack.length - 1;
    setNavVersion((version) => version + 1);
  }

  function applyNavEntry(entry: { route: AppRoute; gameKey: string | null }) {
    applyingNav.current = true;
    try {
      setState((current) =>
        reduceAppState(current ?? viewState, { type: 'route/change', route: entry.route }),
      );
      if (entry.route === 'store') {
        if (entry.gameKey) setNoticeFocusGameKey(entry.gameKey);
        else setStoreHomeNonce((nonce) => nonce + 1);
      }
    } finally {
      applyingNav.current = false;
    }
  }

  function goNav(offset: -1 | 1) {
    const next = navIndex.current + offset;
    if (next < 0 || next >= navStack.current.length) return;
    navIndex.current = next;
    setNavVersion((version) => version + 1);
    applyNavEntry(navStack.current[next]);
  }

  // Mouse buttons 4/5 navigate, like the Steam client.
  useEffect(() => {
    function onMouseUp(event: MouseEvent) {
      if (event.button === 3) goNav(-1);
      else if (event.button === 4) goNav(1);
    }
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The header's persistent store search: one light record per game, kept in
  // step with the tracked catalog. Only storefront games are suggested — the
  // store never surfaces source-only or in-development projects.
  const searchGames = useMemo(
    () =>
      groupTrackedProjects(state?.trackedProjects ?? [])
        .filter(isStorefrontReady)
        .map((game) => ({
          gameKey: game.gameKey,
          title: game.gameShortTitle,
          searchText: `${game.gameTitle} ${game.gameShortTitle}`.toLowerCase(),
          coverUrl: game.coverUrl,
          availability: AVAILABILITY_LABELS[game.availability],
        })),
    [state?.trackedProjects],
  );
  const [scanTick, setScanTick] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  // Why a Play click did nothing, surfaced in the library rather than a
  // console the player will never open.
  const [launchError, setLaunchError] = useState<string | null>(null);
  // Wine decides whether Windows-only releases are worth offering; resolved
  // once, then a re-render so the store reflects it.
  const [wineProbed, setWineProbed] = useState(false);
  useEffect(() => {
    void probeWine().then(() => setWineProbed(true));
  }, []);
  void wineProbed;
  // The game whose install is running, so its button can say so.
  const [installing, setInstalling] = useState<string | null>(null);
  const scanInFlight = useRef(false);
  const lastScanAttempt = useRef(0);
  const scanBackoffUntil = useRef(0);
  // Long-running async flows (downloads, scans) must not apply their results
  // onto a different profile than the one they started under.
  const profileEpoch = useRef(0);

  // Live per-download progress for the downloads bar (ephemeral, not persisted).
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, DownloadProgressEvent>
  >({});

  // Live mods load once per session when the Mods tab is first opened.
  const [liveMods, setLiveMods] = useState<LiveMod[] | null>(null);
  const [modsLoading, setModsLoading] = useState(false);
  const modsRequested = useRef(false);

  // Optional Classicomp account (Supabase); the app is fully usable without it.
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const [accountPending, setAccountPending] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingFriends, setPendingFriends] = useState<Friend[]>([]);
  const [friendsError, setFriendsError] = useState<string | null>(null);

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
    // Clicking Store while already on the store is Steam's "go home", not a
    // dead click: close any open game page and land at the top.
    if (route === 'store' && viewState.route === 'store') {
      setStoreHomeNonce((nonce) => nonce + 1);
      pushNav({ route: 'store', gameKey: null });
      return;
    }
    pushNav({ route, gameKey: null });
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
    profileEpoch.current += 1;
    const next = await activeBridge.setActiveProfile(profileId);
    setState((current) => (current === null ? next : { ...next, route: current.route }));
  }

  async function signOut() {
    profileEpoch.current += 1;
    setDownloadsOpen(false);
    applyBridgeResult(await activeBridge.signOut());
  }

  async function queueInstall(gameId: string) {
    applyBridgeResult(await activeBridge.queueInstall(gameId));
    setDownloadsOpen(true);
  }

  // Install unpacks the downloaded artifact and registers whatever came out of
  // it — a zip of a Flatpak bundle has to reach `flatpak install` before Play
  // can mean anything. It is a real step with real failure modes, so the
  // reason surfaces in the library rather than a console.
  async function installGame(gameId: string): Promise<boolean> {
    const entry = activeLibrary.find((item) => item.gameId === gameId);
    if (!entry?.downloadedFile) {
      setLaunchError('Download this game before installing it.');
      return false;
    }
    setInstalling(gameId);
    setLaunchError(null);
    const result = await installDownloadedBuild(gameId, entry.downloadedFile);
    setInstalling(null);
    if (result.ok) {
      // Record which release this install came from, so a later scan can tell
      // whether it has gone stale.
      const version =
        viewState.trackedProjects
          .filter((project) => libraryGameId(project) === gameId)
          .map((project) => project.latestVersion)
          .find(Boolean) ?? null;
      applyBridgeResult(await activeBridge.setGameInstalled(gameId, result.launch, version));
      return true;
    }
    setLaunchError(result.reason);
    return false;
  }

  // Play runs what Install produced, never the downloaded archive.
  async function playGame(gameId: string) {
    const entry = activeLibrary.find((item) => item.gameId === gameId);
    if (!entry?.installPath) {
      setLaunchError('Install this game before playing it.');
      return;
    }
    // A build that cannot ask for the original game itself gets handed the
    // copy the player linked — on the command line, or as a file beside it.
    const prerequisite = prerequisiteForGame(gameId, viewState.trackedProjects);
    const result = await runInstalledBuild(entry.installPath, {
      prerequisite,
      romPath: entry.romPath,
    });
    if (!result.ok) setLaunchError(result.reason);
  }

  // Linking the player's own original copy is the last gate before Play, so
  // it goes straight through the bridge and is persisted like any other
  // library fact.
  async function setGameRom(gameId: string, romPath: string | null) {
    applyBridgeResult(await activeBridge.setGameRom(gameId, romPath));
    if (romPath === null) return;
    // Some builds need the disc converted into game data before they can run
    // at all — OpenGOAL extracts, decompiles and recompiles the whole game.
    // That belongs here, where the player just chose the file and expects to
    // wait, not behind Play.
    const prerequisite = prerequisiteForGame(gameId, viewState.trackedProjects);
    if (prerequisite?.kind !== 'tool') return;
    setInstalling(gameId);
    setLaunchError(null);
    const result = await runGameSetup(gameId, prerequisite, romPath);
    setInstalling(null);
    if (!result.ok) setLaunchError(result.reason);
  }

  async function dismissNotice(noticeId: string) {
    applyBridgeResult(await activeBridge.dismissNotice(noticeId));
  }

  async function uninstallGame(gameId: string) {
    // Remove what installing put on disk before dropping the record, since the
    // record is where the launch target lives. Failure is reported but does
    // not block: a player who asked to uninstall must not be left with the
    // entry still sitting there because a directory was busy.
    const entry = activeLibrary.find((item) => item.gameId === gameId);
    const removal = await removeInstalledBuild(gameId, entry?.installPath ?? null);
    if (!removal.ok) setLaunchError(removal.reason);
    applyBridgeResult(await activeBridge.uninstallGame(gameId));
  }

  async function toggleMod(modId: string) {
    applyBridgeResult(await activeBridge.toggleMod(modId));
  }

  async function toggleWatch(gameKey: string) {
    const next = await activeBridge.toggleWatch(gameKey);
    applyBridgeResult(next);
    // Signed-in accounts mirror the wishlist to Supabase, best effort.
    if (accountSession) {
      const client = accountClient();
      if (client && next.activeProfileId) {
        void syncWishlist(
          client,
          accountSession.userId,
          next.watchlists[next.activeProfileId] ?? [],
        );
      }
    }
  }

  // Real downloads: stream the chosen release asset with progress; the
  // downloads bar tracks store-linked games through the persisted queue.
  async function downloadProjectAsset(project: TrackedProject, asset?: DownloadAsset) {
    const chosen = asset ?? pickBestAsset(project.downloadAssets);
    if (!chosen) return;
    const epoch = profileEpoch.current;

    // Every download enters the library, not just the handful of seeded games.
    // Scanned projects carry no gameId, and requiring one here meant 51 of the
    // 57 downloadable projects downloaded a file that appeared nowhere — no
    // library entry, no queue row, no progress. The library record is derived
    // from the project instead.
    const gameId = libraryGameId(project);
    let downloadId: string | null = null;
    if (viewState.activeProfileId) {
      downloadId = `download-${viewState.activeProfileId}-${gameId}`;
      applyBridgeResult(
        await activeBridge.queueInstall(gameId, gameFromTrackedProject(project)),
      );
      setDownloadsOpen(true);
      applyBridgeResult(await activeBridge.setDownloadState(downloadId, 'downloading', 0));
    }

    const result = await downloadAssetFile(chosen, (event) => {
      if (!downloadId || profileEpoch.current !== epoch) return;
      const id = downloadId;
      setDownloadProgress((current) => ({ ...current, [id]: event }));
    });

    if (downloadId && profileEpoch.current === epoch) {
      const id = downloadId;
      // A browser-managed fallback download cannot report completion; mark the
      // queue entry done either way — the file is in the browser's hands.
      void result;
      applyBridgeResult(
        await activeBridge.setDownloadState(id, 'complete', 100, chosen.name),
      );
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  async function refreshFriends(session: AccountSession) {
    const client = accountClient();
    if (!client) return;
    const result = await fetchFriends(client, session.userId);
    setFriends(result.friends);
    setPendingFriends(result.pending);
    setFriendsError(result.error);
  }

  async function handleSignIn(email: string, password: string, mode: 'signIn' | 'signUp') {
    const client = accountClient();
    if (!client) {
      setAccountError('Connect a Supabase project first.');
      return;
    }
    setAccountPending(true);
    setAccountError(null);
    const { session, error } = await accountSignIn(client, email, password, mode);
    setAccountPending(false);
    setAccountError(error);
    setAccountSession(session);
    if (session) void refreshFriends(session);
  }

  async function handleAccountSignOut() {
    const client = accountClient();
    if (client) await accountSignOut(client);
    setAccountSession(null);
    setFriends([]);
    setPendingFriends([]);
  }

  function handleSaveAccountConfig(url: string, anonKey: string) {
    saveAccountConfig({ url, anonKey });
    setAccountError(null);
  }

  async function handleAddFriend(email: string) {
    const client = accountClient();
    if (!client || !accountSession) return;
    const error = await accountAddFriend(client, accountSession.userId, email);
    setFriendsError(error);
    if (!error) void refreshFriends(accountSession);
  }

  // Restore an existing account session on launch, when configured.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await currentSession(accountClient());
      if (mounted && session) {
        setAccountSession(session);
        void refreshFriends(session);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Live mods are fetched the first time the Mods tab opens, and again
  // whenever the user edits the pinned mod repositories.
  const [modsNonce, setModsNonce] = useState(0);
  useEffect(() => {
    if (viewState.route !== 'mods' || modsRequested.current) return;
    modsRequested.current = true;
    setModsLoading(true);
    collectModsFn(viewState.games)
      .then((mods) => setLiveMods(mods))
      .catch(() => setLiveMods([]))
      .finally(() => setModsLoading(false));
  }, [viewState.route, modsNonce]);

  function refreshLiveMods() {
    modsRequested.current = false;
    setModsNonce((nonce) => nonce + 1);
  }

  async function refreshTracking() {
    const epoch = profileEpoch.current;
    const batch = selectScanBatch(viewState.trackedProjects);
    const updates = await collect(batch);
    const next = await activeBridge.applyTrackingUpdates(updates, new Date().toISOString());
    if (profileEpoch.current === epoch) applyBridgeResult(next);
  }

  // Fully automatic updates: whenever a scan is due, one runs — on launch and
  // then on a timer while the app stays open. Each pass also discovers new
  // projects and adds them to the store. Failures keep the last verified data.
  useEffect(() => {
    if (state === null || scanInFlight.current) return;
    if (Date.now() - lastScanAttempt.current < 60_000) return;
    // A failed scan backs off for a while; without this, any state change
    // (tab switches, wishlist toggles) would retrigger bursts while offline.
    if (Date.now() < scanBackoffUntil.current) return;
    const lastScan = state.trackingLastScanAt ? Date.parse(state.trackingLastScanAt) : null;
    const staleFor = lastScan === null ? Infinity : Date.now() - lastScan;
    const hasUnchecked = state.trackedProjects.some(
      (project) => project.lastCheckedAt === null,
    );
    const due =
      staleFor > TRACKING_SCAN_INTERVAL_MS ||
      (hasUnchecked && staleFor > INITIAL_FILL_INTERVAL_MS);
    if (!due) return;

    scanInFlight.current = true;
    lastScanAttempt.current = Date.now();
    const projects = state.trackedProjects;
    (async () => {
      try {
        await refreshTracking();
        setScanError(null);
        try {
          const discovered = await discover(projects);
          if (discovered.length > 0) {
            applyBridgeResult(await activeBridge.addTrackedProjects(discovered));
          }
        } catch {
          // Discovery is best-effort extra; its failures never flag the scan.
        }
      } catch {
        // The store keeps showing the last verified data.
        setScanError('Sources unreachable — showing the last verified data.');
        scanBackoffUntil.current = Date.now() + 30 * 60 * 1000;
      } finally {
        scanInFlight.current = false;
      }
    })();
  }, [state, scanTick]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setScanTick((tick) => tick + 1),
      5 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Auto-update. A game the player installed goes stale when the project cuts
  // a new release; keeping it current is the storefront's job, not a chore.
  // One game at a time, sequentially, so a shelf full of updates cannot
  // saturate the connection — and only for games already installed, because
  // updating something the player never installed is just unrequested traffic.
  // Save data survives: the installer lifts it out before unpacking.
  const autoUpdating = useRef(false);
  // An update that fails is not retried for the rest of the session. Without
  // this the effect re-runs on every state change, finds the same still-stale
  // game, and redownloads it forever — the version only advances on success,
  // so failure is a loop, not a one-off.
  const autoUpdateFailed = useRef(new Set<string>());
  useEffect(() => {
    if (autoUpdating.current || installing !== null) return;
    const stale = selectVisibleLibrary(viewState)
      .filter((entry) => !autoUpdateFailed.current.has(entry.gameId))
      .map((entry) => {
        const projects = viewState.trackedProjects.filter(
          (project) => libraryGameId(project) === entry.gameId,
        );
        return { entry, projects, version: updateAvailable(entry, projects) };
      })
      .filter((row) => row.version !== null);
    if (stale.length === 0) return;

    autoUpdating.current = true;
    void (async () => {
      try {
        for (const row of stale) {
          const project = row.projects.find((candidate) => candidate.downloadAssets.length > 0);
          if (!project) {
            autoUpdateFailed.current.add(row.entry.gameId);
            continue;
          }
          await downloadProjectAsset(project);
          // installGame reports whether it actually landed. A failure that is
          // not remembered becomes a loop, because the version only advances
          // on success and the effect re-runs on every state change.
          const updated = await installGame(row.entry.gameId);
          if (!updated) autoUpdateFailed.current.add(row.entry.gameId);
        }
      } finally {
        autoUpdating.current = false;
      }
    })();
  }, [viewState, installing]);

  const activeMods = selectVisibleMods(viewState);
  const downloadsForProfile = viewState.downloads.filter(
    (download) => download.profileId === viewState.activeProfileId,
  );


  if (!activeProfile) {
    return <SignInView profiles={viewState.profiles} onSignIn={activateProfile} />;
  }

  const activeLibrary = selectVisibleLibrary(viewState);

  return (
    <main className="app-shell">
      <a
        className="skip-link"
        href="#active-view"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('active-view')?.focus();
        }}
      >
        Skip to content
      </a>
      <AppHeader
        activeProfile={activeProfile}
        profiles={viewState.profiles}
        route={viewState.route}
        accountEmail={accountSession?.email ?? null}
        releaseNotices={viewState.releaseNotices}
        onDismissNotice={(noticeId) => void dismissNotice(noticeId)}
        canNavBack={navIndex.current > 0}
        canNavForward={navIndex.current < navStack.current.length - 1}
        searchGames={searchGames}
        onNavBack={() => goNav(-1)}
        onNavForward={() => goNav(1)}
        onOpenNoticeGame={(gameKey) => {
          pushNav({ route: 'store', gameKey });
          setState((current) =>
            reduceAppState(current ?? viewState, { type: 'route/change', route: 'store' }),
          );
          setNoticeFocusGameKey(gameKey);
        }}
        onActivateProfile={activateProfile}
        onChangeRoute={changeRoute}
        onSignOut={signOut}
        onOpenSignIn={() => setSignInOpen(true)}
        onOpenFriends={() => setFriendsOpen(true)}
      />

      <section className="app-body" id="active-view" tabIndex={-1}>
        {viewState.route === 'library' ? (
          <LibraryView
            entries={activeLibrary}
            games={viewState.games}
            selectedGameId={viewState.selectedGameId}
            hasCloudProvider={Boolean(viewState.cloudProvider)}
            onSelectGame={selectLibraryGame}
            onQueueInstall={queueInstall}
            onBrowseStore={() => changeRoute('store')}
            trackedProjects={viewState.trackedProjects}
            onUninstall={(gameId) => void uninstallGame(gameId)}
            onSetGameRom={(gameId, romPath) => void setGameRom(gameId, romPath)}
            onPlay={(gameId) => void playGame(gameId)}
            onInstallBuild={(gameId) => void installGame(gameId)}
            installingGameId={installing}
            launchError={launchError}
            onDismissLaunchError={() => setLaunchError(null)}
          />
        ) : null}

        {viewState.route === 'store' ? (
          <StoreView
            games={viewState.games}
            projects={viewState.trackedProjects}
            library={activeLibrary}
            watchedGameKeys={selectWatchedGameKeys(viewState)}
            lastScanAt={viewState.trackingLastScanAt}
            scanError={scanError}
            onRefresh={refreshTracking}
            onToggleWatch={toggleWatch}
            onOpenInLibrary={selectLibraryGame}
            onInstall={queueInstall}
            onDownloadProject={(project) => void downloadProjectAsset(project)}
            onDownloadAsset={(project, chosen) => void downloadProjectAsset(project, chosen)}
            liveMods={liveMods}
            onOpenMods={() => changeRoute('mods')}
            focusGameKey={noticeFocusGameKey}
            homeNonce={storeHomeNonce}
            onFocusGameHandled={() => setNoticeFocusGameKey(null)}
            onNavigate={(gameKey) => pushNav({ route: 'store', gameKey })}
          />
        ) : null}

        {viewState.route === 'roadmap' ? <RoadmapView /> : null}

        {viewState.route === 'mods' ? (
          <ModsView
            games={viewState.games}
            mods={activeMods}
            liveMods={liveMods}
            modsLoading={modsLoading}
            onSourcesChanged={refreshLiveMods}
            onToggleMod={toggleMod}
          />
        ) : null}
      </section>

      <DownloadsBar
        downloads={downloadsForProfile}
        games={viewState.games}
        open={downloadsOpen}
        progress={downloadProgress}
        onToggle={setDownloadsOpen}
        onViewInLibrary={(gameId) => {
          selectLibraryGame(gameId);
          setDownloadsOpen(false);
        }}
      />

      <SignInDialog
        open={signInOpen}
        configured={getAccountConfig() !== null}
        status={accountSession ? 'signedIn' : accountPending ? 'pending' : 'signedOut'}
        accountEmail={accountSession?.email ?? null}
        error={accountError}
        onSaveConfig={handleSaveAccountConfig}
        onSubmit={(email, password, mode) => void handleSignIn(email, password, mode)}
        onSignOut={() => void handleAccountSignOut()}
        onClose={() => setSignInOpen(false)}
      />
      <FriendsPanel
        open={friendsOpen}
        friends={friends}
        pending={pendingFriends}
        error={friendsError}
        onAddFriend={(email) => void handleAddFriend(email)}
        onClose={() => setFriendsOpen(false)}
      />
    </main>
  );
}
