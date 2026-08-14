import { describe, expect, it } from 'vitest';
import * as stateModule from './state';
import type { AppState } from './types';

function makeState(): AppState {
  return {
    activeProfileId: 'alex',
    selectedGameId: 'devilutionx',
    route: 'library',
    profiles: [
      { id: 'alex', displayName: 'Alex', avatarInitials: 'AL' },
      { id: 'mira', displayName: 'Mira', avatarInitials: 'MI' },
    ],
    games: [
      {
        id: 'devilutionx',
        title: 'DevilutionX',
        shortTitle: 'DX',
        summary: 'Diablo engine reconstruction',
        description: 'A careful source port.',
        artworkUrl: '',
        iconUrl: '',
        runtime: 'Native Linux',
        version: '1.5.4',
        executablePath: null,
        upstreamUrl: 'https://github.com/diasurgical/devilutionX',
        accent: '#a33b33',
      },
      {
        id: 'openrct2',
        title: 'OpenRCT2',
        shortTitle: 'RCT',
        summary: 'Open-source RollerCoaster Tycoon 2',
        description: 'A modern recreation of RollerCoaster Tycoon 2.',
        artworkUrl: '',
        iconUrl: '',
        runtime: 'Native Linux',
        version: '0.5.4',
        executablePath: '/usr/bin/openrct2',
        upstreamUrl: 'https://openrct2.io',
        accent: '#5c8a45',
      },
    ],
    libraries: {
      alex: [
        {
          gameId: 'devilutionx',
          installState: 'available',
          installPath: null,
          playMinutes: 0,
        },
      ],
      mira: [
        {
          gameId: 'openrct2',
          installState: 'installed',
          installPath: '/games/openrct2',
          playMinutes: 421,
        },
      ],
    },
    downloads: [],
    saveSnapshots: [],
    cloudProvider: null,
  };
}

describe('Classicomp application state', () => {
  it('switches profile and selects the first game in that profile library', () => {
    const reduceAppState = (stateModule as {
      reduceAppState?: (state: unknown, action: unknown) => Record<string, unknown>;
    }).reduceAppState;

    expect(typeof reduceAppState).toBe('function');
    if (!reduceAppState) return;

    const initial = makeState();

    const next = reduceAppState(initial, {
      type: 'profile/activate',
      profileId: 'mira',
    });

    expect(next.activeProfileId).toBe('mira');
    expect(next.selectedGameId).toBe('openrct2');
  });

  it('changes the active route without mutating the previous state', () => {
    const initial = makeState();
    const next = stateModule.reduceAppState(initial, {
      type: 'route/change',
      route: 'catalog',
    });

    expect(next.route).toBe('catalog');
    expect(initial.route).toBe('library');
  });

  it('selects a game and returns to its library detail page', () => {
    const initial = { ...makeState(), route: 'downloads' as const };
    const next = stateModule.reduceAppState(initial, {
      type: 'game/select',
      gameId: 'openrct2',
    });

    expect(next.selectedGameId).toBe('openrct2');
    expect(next.route).toBe('library');
  });

  it('queues one persistent download for an available game', () => {
    const initial = makeState();
    const next = stateModule.reduceAppState(initial, {
      type: 'install/queue',
      gameId: 'devilutionx',
    });
    const repeated = stateModule.reduceAppState(next, {
      type: 'install/queue',
      gameId: 'devilutionx',
    });

    expect(next.libraries.alex[0]?.installState).toBe('queued');
    expect(next.downloads).toEqual([
      {
        id: 'download-alex-devilutionx',
        profileId: 'alex',
        gameId: 'devilutionx',
        state: 'queued',
        progress: 0,
        bytesPerSecond: 0,
        etaSeconds: null,
      },
    ]);
    expect(next.route).toBe('downloads');
    expect(repeated.downloads).toHaveLength(1);
  });
});
