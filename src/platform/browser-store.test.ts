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
    const createBrowserBridge = browserStoreModule.createBrowserBridge;

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

    await firstRun.queueInstall('devilutionx');
    await firstRun.queueInstall('devilutionx');

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(state.downloads).toHaveLength(1);
    expect(state.downloads[0]).toMatchObject({
      gameId: 'devilutionx',
      profileId: 'owner',
      state: 'queued',
    });
  });

  it('persists sign-out across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.signOut();
    const restarted = createBrowserBridge(storage);
    expect((await restarted.loadState()).activeProfileId).toBeNull();

    await restarted.setActiveProfile('guest');
    expect((await createBrowserBridge(storage).loadState()).activeProfileId).toBe('guest');
  });

  it('persists mod toggles across bridge recreation', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();
    const firstRun = createBrowserBridge(storage);

    await firstRun.toggleMod('mod-openmw-rebirth');

    const restarted = createBrowserBridge(storage);
    const state = await restarted.loadState();
    expect(state.mods.owner?.find((mod) => mod.id === 'mod-openmw-rebirth')?.enabled).toBe(true);
    expect(state.mods.guest?.find((mod) => mod.id === 'mod-openmw-rebirth')?.enabled).toBe(false);
  });

  it('maps a legacy persisted downloads route to the library', async () => {
    const createBrowserBridge = browserStoreModule.createBrowserBridge;
    const storage = new MemoryStorage();

    const firstRun = createBrowserBridge(storage);
    const state = await firstRun.loadState();
    storage.setItem(
      'classicomp.app-state.v2',
      JSON.stringify({ ...state, route: 'downloads' }),
    );

    expect((await createBrowserBridge(storage).loadState()).route).toBe('library');
  });
});
