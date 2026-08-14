import { describe, expect, it } from 'vitest';
import * as seedModule from './seed';

describe('first-run state', () => {
  it('starts with an honest local-only catalog and valid game references', () => {
    const seedState = (seedModule as { seedState?: {
      cloudProvider: string | null;
      games: Array<{ id: string; tags: string[] }>;
      libraries: Record<string, Array<{ gameId: string; installState: string }>>;
      mods: Record<string, Array<{ gameId: string; enabled: boolean }>>;
      saveSnapshots: unknown[];
    } }).seedState;

    expect(seedState).toBeDefined();
    if (!seedState) return;

    const gameIds = new Set(seedState.games.map((game) => game.id));
    const entries = Object.values(seedState.libraries).flat();

    expect(seedState.cloudProvider).toBeNull();
    expect(seedState.saveSnapshots).toEqual([]);
    expect(entries.every((entry) => entry.installState === 'available')).toBe(true);
    expect(entries.every((entry) => gameIds.has(entry.gameId))).toBe(true);
    expect(seedState.games.every((game) => game.tags.length > 0)).toBe(true);

    const modEntries = Object.values(seedState.mods).flat();
    expect(modEntries.length).toBeGreaterThan(0);
    expect(modEntries.every((mod) => gameIds.has(mod.gameId))).toBe(true);
    expect(seedState.mods.owner?.filter((mod) => mod.enabled)).toHaveLength(1);
    expect(seedState.mods.guest?.every((mod) => !mod.enabled)).toBe(true);
  });
});
