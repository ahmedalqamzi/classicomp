import { invoke } from '@tauri-apps/api/core';
import type { AppState, DownloadState, Game, TrackedProject, TrackedProjectUpdate } from '../domain/types';
import type { PlatformBridge } from './bridge';

export function createTauriBridge(): PlatformBridge {
  return {
    loadState(): Promise<AppState> {
      return invoke<AppState>('load_state');
    },

    setActiveProfile(profileId: string): Promise<AppState> {
      return invoke<AppState>('set_active_profile', { profileId });
    },

    signOut(): Promise<AppState> {
      return invoke<AppState>('sign_out');
    },

    queueInstall(gameId: string, game?: Game): Promise<AppState> {
      return invoke<AppState>('queue_install', { gameId, game });
    },

    toggleMod(modId: string): Promise<AppState> {
      return invoke<AppState>('toggle_mod', { modId });
    },

    toggleWatch(gameKey: string): Promise<AppState> {
      return invoke<AppState>('toggle_watch', { gameKey });
    },

    applyTrackingUpdates(
      updates: TrackedProjectUpdate[],
      scannedAt: string,
    ): Promise<AppState> {
      return invoke<AppState>('apply_tracking_updates', { updates, scannedAt });
    },

    addTrackedProjects(projects: TrackedProject[]): Promise<AppState> {
      return invoke<AppState>('add_tracked_projects', { projects });
    },

    dismissNotice(noticeId: string): Promise<AppState> {
      return invoke<AppState>('dismiss_notice', { noticeId });
    },

    uninstallGame(gameId: string): Promise<AppState> {
      return invoke<AppState>('uninstall_game', { gameId });
    },

    setGameRom(gameId: string, romPath: string | null): Promise<AppState> {
      return invoke<AppState>('set_game_rom', { gameId, romPath });
    },

    setGameInstalled(
      gameId: string,
      launchTarget: string,
      installedVersion: string | null,
    ): Promise<AppState> {
      return invoke<AppState>('set_game_installed', { gameId, launchTarget, installedVersion });
    },

    setDownloadState(
      downloadId: string,
      state: DownloadState,
      progress?: number,
      fileName?: string,
    ): Promise<AppState> {
      return invoke<AppState>('set_download_state', { downloadId, state, progress, fileName });
    },
  };
}
