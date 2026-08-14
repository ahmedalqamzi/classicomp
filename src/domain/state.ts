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
          },
        ];

    return {
      ...state,
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

  if (action.type !== 'profile/activate') return state;

  const firstGame = state.libraries[action.profileId]?.[0]?.gameId;
  if (!firstGame) return state;

  return {
    ...state,
    activeProfileId: action.profileId,
    selectedGameId: firstGame,
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
