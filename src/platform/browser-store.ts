import { seedState } from '../data/seed';
import { reduceAppState } from '../domain/state';
import type { AppRoute, AppState } from '../domain/types';

const STORAGE_KEY = 'classicomp.app-state.v2';
const KNOWN_ROUTES: AppRoute[] = ['library', 'catalog', 'mods'];

function cloneSeedState(): AppState {
  return structuredClone(seedState);
}

function sanitizeRoute(state: AppState): AppState {
  return KNOWN_ROUTES.includes(state.route) ? state : { ...state, route: 'library' };
}

function readState(storage: Storage): AppState {
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return cloneSeedState();

  try {
    return sanitizeRoute(JSON.parse(stored) as AppState);
  } catch {
    return cloneSeedState();
  }
}

function writeState(storage: Storage, state: AppState): AppState {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function createBrowserBridge(storage: Storage) {
  return {
    async loadState(): Promise<AppState> {
      return readState(storage);
    },

    async setActiveProfile(profileId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'profile/activate',
        profileId,
      });
      return writeState(storage, next);
    },

    async signOut(): Promise<AppState> {
      const next = reduceAppState(readState(storage), { type: 'profile/signOut' });
      return writeState(storage, next);
    },

    async queueInstall(gameId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), {
        type: 'install/queue',
        gameId,
      });
      return writeState(storage, next);
    },

    async toggleMod(modId: string): Promise<AppState> {
      const next = reduceAppState(readState(storage), { type: 'mod/toggle', modId });
      return writeState(storage, next);
    },
  };
}
