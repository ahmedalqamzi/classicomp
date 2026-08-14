import { describe, expect, it } from 'vitest';
import * as browserStoreModule from './browser-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('browser persistence bridge', () => {
  it('restores the active profile from persisted browser state', async () => {
    const createBrowserBridge = (browserStoreModule as {
      createBrowserBridge?: (storage: Storage) => {
        loadState(): Promise<{ activeProfileId: string }>;
        setActiveProfile(profileId: string): Promise<unknown>;
      };
    }).createBrowserBridge;

    expect(typeof createBrowserBridge).toBe('function');
    if (!createBrowserBridge) return;

    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);
    await firstRun.setActiveProfile('guest');

    const restarted = createBrowserBridge(storage);
    expect((await restarted.loadState()).activeProfileId).toBe('guest');
  });

  it('persists one queued install across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);
    const queueInstall = (firstRun as typeof firstRun & {
      queueInstall?: (gameId: string) => Promise<unknown>;
    }).queueInstall;

    expect(typeof queueInstall).toBe('function');
    if (!queueInstall) return;

    await queueInstall('devilutionx');
    await queueInstall('devilutionx');

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(state.downloads).toHaveLength(1);
    expect(state.downloads[0]).toMatchObject({
      gameId: 'devilutionx',
      profileId: 'owner',
      state: 'queued',
    });
  });
});
