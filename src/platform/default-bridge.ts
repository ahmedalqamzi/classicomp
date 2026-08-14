import { isTauri } from '@tauri-apps/api/core';
import { createBrowserBridge } from './browser-store';
import type { PlatformBridge } from './bridge';
import { createTauriBridge } from './tauri-store';

export function createDefaultBridge(storage?: Storage): PlatformBridge {
  return isTauri() ? createTauriBridge() : createBrowserBridge(storage ?? window.localStorage);
}
