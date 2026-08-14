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
        tags: ['RPG', 'Action'],
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
        tags: ['Simulation', 'Strategy'],
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
    mods: {
      alex: [
        {
          id: 'mod-devilutionx-infernal',
          gameId: 'devilutionx',
          name: 'Infernal Difficulty',
          summary: 'Brutal difficulty rebalance for veteran players.',
          version: '0.9',
          author: 'Community',
          enabled: false,
        },
      ],
      mira: [
        {
          id: 'mod-devilutionx-infernal',
          gameId: 'devilutionx',
          name: 'Infernal Difficulty',
          summary: 'Brutal difficulty rebalance for veteran players.',
          version: '0.9',
          author: 'Community',
          enabled: false,
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
    const initial = makeState();

    const next = stateModule.reduceAppState(initial, {
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
    const initial = { ...makeState(), route: 'catalog' as const };
    const next = stateModule.reduceAppState(initial, {
      type: 'game/select',
      gameId: 'openrct2',
    });

    expect(next.selectedGameId).toBe('openrct2');
    expect(next.route).toBe('library');
  });

  it('queues one persistent download for an available game without changing route', () => {
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
    expect(next.route).toBe('library');
    expect(repeated.downloads).toHaveLength(1);
  });

  it('ignores install queue requests when signed out', () => {
    const initial = { ...makeState(), activeProfileId: null };
    const next = stateModule.reduceAppState(initial, {
      type: 'install/queue',
      gameId: 'devilutionx',
    });

    expect(next).toBe(initial);
  });

  it('signs out by clearing the active profile', () => {
    const next = stateModule.reduceAppState(makeState(), { type: 'profile/signOut' });

    expect(next.activeProfileId).toBeNull();
  });

  it('signs in again after signing out', () => {
    const signedOut = stateModule.reduceAppState(makeState(), { type: 'profile/signOut' });
    const next = stateModule.reduceAppState(signedOut, {
      type: 'profile/activate',
      profileId: 'mira',
    });

    expect(next.activeProfileId).toBe('mira');
    expect(next.selectedGameId).toBe('openrct2');
  });

  it('toggles a mod only for the active profile', () => {
    const next = stateModule.reduceAppState(makeState(), {
      type: 'mod/toggle',
      modId: 'mod-devilutionx-infernal',
    });

    expect(next.mods.alex[0]?.enabled).toBe(true);
    expect(next.mods.mira[0]?.enabled).toBe(false);
  });

  it('ignores mod toggles when signed out or for unknown mods', () => {
    const signedOut = { ...makeState(), activeProfileId: null };
    expect(
      stateModule.reduceAppState(signedOut, {
        type: 'mod/toggle',
        modId: 'mod-devilutionx-infernal',
      }),
    ).toBe(signedOut);

    const initial = makeState();
    expect(
      stateModule.reduceAppState(initial, { type: 'mod/toggle', modId: 'mod-unknown' }),
    ).toBe(initial);
  });

  it('returns no library entries or mods when signed out', () => {
    const signedOut = { ...makeState(), activeProfileId: null };

    expect(stateModule.selectVisibleLibrary(signedOut)).toEqual([]);
    expect(stateModule.selectVisibleMods(signedOut)).toEqual([]);
  });
});
