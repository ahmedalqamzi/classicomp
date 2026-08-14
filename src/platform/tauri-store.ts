import { invoke } from '@tauri-apps/api/core';
import type { AppState } from '../domain/types';
import type { PlatformBridge } from './bridge';

export function createTauriBridge(): PlatformBridge {
  return {
    loadState(): Promise<AppState> {
      return invoke<AppState>('load_state');
    },

    setActiveProfile(profileId: string): Promise<AppState> {
      return invoke<AppState>('set_active_profile', { profileId });
    },

    queueInstall(gameId: string): Promise<AppState> {
      return invoke<AppState>('queue_install', { gameId });
    },
  };
}
