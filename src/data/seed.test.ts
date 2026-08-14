import { describe, expect, it } from 'vitest';
import * as seedModule from './seed';

describe('first-run state', () => {
  it('starts with an honest local-only catalog and valid game references', () => {
    const seedState = (seedModule as { seedState?: {
      cloudProvider: string | null;
      games: Array<{ id: string }>;
      libraries: Record<string, Array<{ gameId: string; installState: string }>>;
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
  });
});

