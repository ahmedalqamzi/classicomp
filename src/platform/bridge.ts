import type {
  AppState,
  DownloadState,
  Game,
  TrackedProject,
  TrackedProjectUpdate,
} from '../domain/types';

export interface PlatformBridge {
  loadState(): Promise<AppState>;
  setActiveProfile(profileId: string): Promise<AppState>;
  signOut(): Promise<AppState>;
  queueInstall(gameId: string, game?: Game): Promise<AppState>;
  toggleMod(modId: string): Promise<AppState>;
  toggleWatch(gameKey: string): Promise<AppState>;
  applyTrackingUpdates(updates: TrackedProjectUpdate[], scannedAt: string): Promise<AppState>;
  addTrackedProjects(projects: TrackedProject[]): Promise<AppState>;
  setDownloadState(
    downloadId: string,
    state: DownloadState,
    progress?: number,
    fileName?: string,
  ): Promise<AppState>;
  uninstallGame(gameId: string): Promise<AppState>;
  // Links (romPath) or clears (null) the player's own copy of the original
  // game, which is what unlocks Play for a recompilation.
  setGameRom(gameId: string, romPath: string | null): Promise<AppState>;
  // Records the launch target the desktop shell resolved while installing.
  setGameInstalled(
    gameId: string,
    launchTarget: string,
    installedVersion: string | null,
  ): Promise<AppState>;
  dismissNotice(noticeId: string): Promise<AppState>;
}
