import type { AppAction, AppState, Game, LibraryEntry, Mod } from './types';

export function reduceAppState(state: AppState, action: AppAction): AppState {
  if (action.type === 'route/change') {
    return { ...state, route: action.route };
  }

  if (action.type === 'game/select') {
    return { ...state, selectedGameId: action.gameId, route: 'library' };
  }

  if (action.type === 'profile/signOut') {
    return { ...state, activeProfileId: null };
  }

  if (action.type === 'mod/toggle') {
    if (state.activeProfileId === null) return state;
    const mods = state.mods[state.activeProfileId];
    if (!mods?.some((mod) => mod.id === action.modId)) return state;

    return {
      ...state,
      mods: {
        ...state.mods,
        [state.activeProfileId]: mods.map((mod) =>
          mod.id === action.modId ? { ...mod, enabled: !mod.enabled } : mod,
        ),
      },
    };
  }

  if (action.type === 'install/queue') {
    if (state.activeProfileId === null) return state;
    const activeProfileId = state.activeProfileId;
    const downloadId = `download-${activeProfileId}-${action.gameId}`;
    if (state.downloads.some((download) => download.id === downloadId)) {
      return state;
    }

    const library = state.libraries[activeProfileId] ?? [];
    const hasEntry = library.some((entry) => entry.gameId === action.gameId);
    const nextLibrary = hasEntry
      ? library.map((entry) =>
          entry.gameId === action.gameId
            ? { ...entry, installState: 'queued' as const }
            : entry,
        )
      : [
          ...library,
          {
            gameId: action.gameId,
            installState: 'queued' as const,
            installPath: null,
            playMinutes: 0,
            romPath: null,
            downloadedFile: null,
            installedVersion: null,
          },
        ];

    // A scanned project has no seeded Game, and the library renders from
    // state.games — without this the entry would exist but show nothing.
    const games =
      action.game && !state.games.some((game) => game.id === action.gameId)
        ? [...state.games, action.game]
        : state.games;

    return {
      ...state,
      games,
      libraries: {
        ...state.libraries,
        [activeProfileId]: nextLibrary,
      },
      downloads: [
        ...state.downloads,
        {
          id: downloadId,
          profileId: activeProfileId,
          gameId: action.gameId,
          state: 'queued',
          progress: 0,
          bytesPerSecond: 0,
          etaSeconds: null,
        },
      ],
    };
  }

  if (action.type === 'tracking/toggleWatch') {
    if (state.activeProfileId === null) return state;
    if (!state.trackedProjects.some((project) => project.gameKey === action.gameKey)) {
      return state;
    }

    const watched = state.watchlists[state.activeProfileId] ?? [];
    const nextWatched = watched.includes(action.gameKey)
      ? watched.filter((gameKey) => gameKey !== action.gameKey)
      : [...watched, action.gameKey];

    return {
      ...state,
      watchlists: {
        ...state.watchlists,
        [state.activeProfileId]: nextWatched,
      },
    };
  }

  if (action.type === 'tracking/applyUpdates') {
    const updatesById = new Map(action.updates.map((update) => [update.id, update]));

    // New releases for wishlisted games become header notices.
    const wishlisted = new Set(
      state.activeProfileId ? state.watchlists[state.activeProfileId] ?? [] : [],
    );
    const freshNotices = state.trackedProjects.flatMap((project) => {
      const update = updatesById.get(project.id);
      if (!update?.latestVersion) return [];
      if (update.latestVersion === project.latestVersion) return [];
      if (!wishlisted.has(project.gameKey)) return [];
      const noticeId = `notice-${project.id}-${update.latestVersion}`;
      if (state.releaseNotices.some((notice) => notice.id === noticeId)) return [];
      return [
        {
          id: noticeId,
          gameKey: project.gameKey,
          gameShortTitle: project.gameShortTitle,
          version: update.latestVersion,
          url: update.downloadUrl ?? project.downloadUrl,
          noticedAt: action.scannedAt,
        },
      ];
    });

    return {
      ...state,
      releaseNotices: [...freshNotices, ...state.releaseNotices].slice(0, 20),
      trackedProjects: state.trackedProjects.map((project) => {
        const update = updatesById.get(project.id);
        if (!update) return project;
        return {
          ...project,
          latestVersion: update.latestVersion ?? project.latestVersion,
          lastActivityAt: update.lastActivityAt ?? project.lastActivityAt,
          developmentState: update.developmentState ?? project.developmentState,
          downloadUrl: update.downloadUrl ?? project.downloadUrl,
          description: update.description ?? project.description,
          topics: update.topics ?? project.topics,
          screenshots: update.screenshots ?? project.screenshots,
          recentReleases: update.recentReleases ?? project.recentReleases,
          downloadAssets: update.downloadAssets ?? project.downloadAssets,
          coverUrl: update.coverChecked ? update.coverUrl : project.coverUrl,
          coverAspect: update.coverChecked ? update.coverAspect : project.coverAspect,
          lastCheckedAt: update.checkedAt ?? project.lastCheckedAt,
        };
      }),
      trackingLastScanAt: action.scannedAt,
    };
  }

  if (action.type === 'notices/dismiss') {
    const remaining = state.releaseNotices.filter((notice) => notice.id !== action.noticeId);
    if (remaining.length === state.releaseNotices.length) return state;
    return { ...state, releaseNotices: remaining };
  }

  if (action.type === 'library/uninstall') {
    if (state.activeProfileId === null) return state;
    const profileId = state.activeProfileId;
    const entries = state.libraries[profileId] ?? [];
    if (!entries.some((entry) => entry.gameId === action.gameId)) return state;
    return {
      ...state,
      libraries: {
        ...state.libraries,
        [profileId]: entries.filter((entry) => entry.gameId !== action.gameId),
      },
      downloads: state.downloads.filter(
        (download) =>
          !(download.profileId === profileId && download.gameId === action.gameId),
      ),
    };
  }

  // Linking (or clearing) the player's own copy of the original game. This is
  // the only thing standing between a finished download and Play for a
  // recompilation, so it is a first-class action rather than a properties
  // side effect.
  if (action.type === 'library/setRom') {
    if (state.activeProfileId === null) return state;
    const profileId = state.activeProfileId;
    const entries = state.libraries[profileId] ?? [];
    if (!entries.some((entry) => entry.gameId === action.gameId)) return state;
    return {
      ...state,
      libraries: {
        ...state.libraries,
        [profileId]: entries.map((entry) =>
          entry.gameId === action.gameId ? { ...entry, romPath: action.romPath } : entry,
        ),
      },
    };
  }

  // Installing is what turns a downloaded artifact into something runnable, so
  // it is the only thing that may write installPath — the launch target the
  // shell resolved (an executable, or a flatpak app id).
  if (action.type === 'library/setInstalled') {
    if (state.activeProfileId === null) return state;
    const profileId = state.activeProfileId;
    const entries = state.libraries[profileId] ?? [];
    if (!entries.some((entry) => entry.gameId === action.gameId)) return state;
    return {
      ...state,
      libraries: {
        ...state.libraries,
        [profileId]: entries.map((entry) =>
          entry.gameId === action.gameId
            ? {
                ...entry,
                installState: 'installed' as const,
                installPath: action.launchTarget,
                installedVersion: action.installedVersion,
              }
            : entry,
        ),
      },
    };
  }

  if (action.type === 'download/setState') {
    const download = state.downloads.find((entry) => entry.id === action.downloadId);
    if (!download) return state;

    const downloads = state.downloads.map((entry) =>
      entry.id === action.downloadId
        ? { ...entry, state: action.state, progress: action.progress ?? entry.progress }
        : entry,
    );
    // A finished download means the file arrived — nothing was installed.
    const libraries =
      action.state === 'complete'
        ? {
            ...state.libraries,
            [download.profileId]: (state.libraries[download.profileId] ?? []).map((entry) =>
              entry.gameId === download.gameId
                ? {
                    ...entry,
                    installState: 'downloaded' as const,
                    downloadedFile: action.fileName ?? entry.downloadedFile,
                  }
                : entry,
            ),
          }
        : state.libraries;
    return { ...state, downloads, libraries };
  }

  if (action.type === 'tracking/addProjects') {
    const knownIds = new Set(state.trackedProjects.map((project) => project.id));
    const additions = action.projects.filter((project) => !knownIds.has(project.id));
    if (additions.length === 0) return state;
    return { ...state, trackedProjects: [...state.trackedProjects, ...additions] };
  }

  if (action.type !== 'profile/activate') return state;

  // Accounts start with an empty library, so activation cannot depend on one.
  const firstGame = state.libraries[action.profileId]?.[0]?.gameId;
  return {
    ...state,
    activeProfileId: action.profileId,
    selectedGameId: firstGame ?? state.selectedGameId,
  };
}

export function selectVisibleLibrary(state: AppState): LibraryEntry[] {
  if (state.activeProfileId === null) return [];
  return state.libraries[state.activeProfileId] ?? [];
}

export function selectVisibleMods(state: AppState): Mod[] {
  if (state.activeProfileId === null) return [];
  return state.mods[state.activeProfileId] ?? [];
}

export function selectGame(state: AppState, gameId: string): Game | undefined {
  return state.games.find((game) => game.id === gameId);
}
