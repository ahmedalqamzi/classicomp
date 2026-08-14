import type { AppState } from '../domain/types';

export interface PlatformBridge {
  loadState(): Promise<AppState>;
  setActiveProfile(profileId: string): Promise<AppState>;
  signOut(): Promise<AppState>;
  queueInstall(gameId: string): Promise<AppState>;
  toggleMod(modId: string): Promise<AppState>;
}
