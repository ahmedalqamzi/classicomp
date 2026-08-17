import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { createDefaultBridge } from './default-bridge';
import { createTauriBridge } from './tauri-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const invoke = vi.fn();
const isTauri = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => isTauri(),
}));

describe('Tauri bridge', () => {
  beforeEach(() => {
    invoke.mockReset();
    isTauri.mockReset();
  });

  it('invokes native commands with stable command names and camelCase args', async () => {
    invoke.mockResolvedValue(seedState);

    const bridge = createTauriBridge();
    await bridge.loadState();
    await bridge.setActiveProfile('guest');
    await bridge.queueInstall('openmw');
    await bridge.signOut();
    await bridge.toggleMod('mod-openmw-rebirth');
    await bridge.toggleWatch('star-fox-64');
    const updates = [
      {
        id: 'starship',
        latestVersion: 'v1.0',
        lastActivityAt: null,
        developmentState: null,
        downloadUrl: null,
        description: null,
        topics: null,
        screenshots: null,
        recentReleases: null,
        downloadAssets: null,
        coverUrl: null,
        coverAspect: null,
        coverChecked: false,
        checkedAt: '2026-08-14T12:00:00Z',
      },
    ];
    await bridge.applyTrackingUpdates(updates, '2026-08-14T12:00:00Z');
    await bridge.uninstallGame('devilutionx');

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_state');
    expect(invoke).toHaveBeenNthCalledWith(2, 'set_active_profile', { profileId: 'guest' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'queue_install', { gameId: 'openmw' });
    expect(invoke).toHaveBeenNthCalledWith(4, 'sign_out');
    expect(invoke).toHaveBeenNthCalledWith(5, 'toggle_mod', { modId: 'mod-openmw-rebirth' });
    expect(invoke).toHaveBeenNthCalledWith(6, 'toggle_watch', { gameKey: 'star-fox-64' });
    expect(invoke).toHaveBeenNthCalledWith(7, 'apply_tracking_updates', {
      updates,
      scannedAt: '2026-08-14T12:00:00Z',
    });
    expect(invoke).toHaveBeenNthCalledWith(8, 'uninstall_game', { gameId: 'devilutionx' });
  });

  it('selects Tauri only when the runtime reports a Tauri shell', () => {
    isTauri.mockReturnValue(false);
    expect(createDefaultBridge(new MemoryStorage())).toHaveProperty('loadState');
    expect(invoke).not.toHaveBeenCalled();

    isTauri.mockReturnValue(true);
    expect(createDefaultBridge()).toHaveProperty('queueInstall');
  });
});
