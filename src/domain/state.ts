import type { AppAction, AppState, Game, LibraryEntry } from './types';

export function reduceAppState(state: AppState, action: AppAction): AppState {
  if (action.type === 'route/change') {
    return { ...state, route: action.route };
  }

  if (action.type === 'game/select') {
    return { ...state, selectedGameId: action.gameId, route: 'library' };
  }

  if (action.type === 'install/queue') {
    const downloadId = `download-${state.activeProfileId}-${action.gameId}`;
    if (state.downloads.some((download) => download.id === downloadId)) {
      return state;
    }

    const library = state.libraries[state.activeProfileId] ?? [];
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
      route: 'downloads',
      libraries: {
        ...state.libraries,
        [state.activeProfileId]: nextLibrary,
      },
      downloads: [
        ...state.downloads,
        {
          id: downloadId,
          profileId: state.activeProfileId,
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
  return state.libraries[state.activeProfileId] ?? [];
}

export function selectGame(state: AppState, gameId: string): Game | undefined {
  return state.games.find((game) => game.id === gameId);
}
