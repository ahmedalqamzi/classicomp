import type { AppState } from '../domain/types';

export interface PlatformBridge {
  loadState(): Promise<AppState>;
  setActiveProfile(profileId: string): Promise<AppState>;
  queueInstall(gameId: string): Promise<AppState>;
}

