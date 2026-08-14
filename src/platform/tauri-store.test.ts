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

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_state');
    expect(invoke).toHaveBeenNthCalledWith(2, 'set_active_profile', { profileId: 'guest' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'queue_install', { gameId: 'openmw' });
  });

  it('selects Tauri only when the runtime reports a Tauri shell', () => {
    isTauri.mockReturnValue(false);
    expect(createDefaultBridge(new MemoryStorage())).toHaveProperty('loadState');
    expect(invoke).not.toHaveBeenCalled();

    isTauri.mockReturnValue(true);
    expect(createDefaultBridge()).toHaveProperty('queueInstall');
  });
});
