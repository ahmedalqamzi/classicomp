import type { AppState, Game, LibraryEntry, Mod } from '../domain/types';

const games: Game[] = [
  {
    id: 'openrct2',
    title: 'OpenRCT2',
    shortTitle: 'RCT',
    summary: 'Open-source reimplementation of RollerCoaster Tycoon 2',
    description:
      'A modern engine for RollerCoaster Tycoon 2 with cross-platform support, expanded limits, and active upstream releases.',
    artworkUrl: '/artwork/openrct2-hero.jpg',
    iconUrl: '/artwork/openrct2-icon.png',
    runtime: 'Native Linux',
    version: '0.5.4',
    executablePath: null,
    upstreamUrl: 'https://openrct2.io',
    accent: '#648f46',
    tags: ['Simulation', 'Strategy'],
  },
  {
    id: 'devilutionx',
    title: 'DevilutionX',
    shortTitle: 'DX',
    summary: 'Modern source port of Diablo and Hellfire',
    description:
      'A maintained engine reconstruction focused on accurate gameplay, modern systems, and portable builds.',
    artworkUrl: '/artwork/devilutionx-hero.png',
    iconUrl: '/artwork/devilutionx-icon.png',
    runtime: 'Native Linux',
    version: '1.5.4',
    executablePath: null,
    upstreamUrl: 'https://github.com/diasurgical/devilutionX',
    accent: '#9b433b',
    tags: ['RPG', 'Action'],
  },
  {
    id: 'openmw',
    title: 'OpenMW',
    shortTitle: 'MW',
    summary: 'Open-source engine for Morrowind',
    description:
      'A clean-room engine implementation with a native Linux runtime, modern tooling, and strong mod support.',
    artworkUrl: '/artwork/openmw-hero.png',
    iconUrl: '/artwork/openmw-icon.jpg',
    runtime: 'Native Linux',
    version: '0.49.0',
    executablePath: null,
    upstreamUrl: 'https://openmw.org',
    accent: '#8a6b3f',
    tags: ['RPG', 'Open World'],
  },
  {
    id: 'openttd',
    title: 'OpenTTD',
    shortTitle: 'TTD',
    summary: 'Transport simulation engine reimplementation',
    description:
      'A long-running open-source transport simulation with native Linux releases and multiplayer support.',
    artworkUrl: '/artwork/openttd-hero.png',
    iconUrl: '/artwork/openttd-icon.png',
    runtime: 'Native Linux',
    version: '15.1',
    executablePath: null,
    upstreamUrl: 'https://www.openttd.org',
    accent: '#4c7693',
    tags: ['Simulation', 'Strategy'],
  },
  {
    id: 'scummvm',
    title: 'ScummVM',
    shortTitle: 'SC',
    summary: 'Adventure game engine collection',
    description:
      'A compatibility layer for many classic point-and-click adventure engines with broad platform support.',
    artworkUrl: '/artwork/scummvm-hero.jpg',
    iconUrl: '/artwork/scummvm-icon.jpg',
    runtime: 'Native Linux',
    version: '2.9.1',
    executablePath: null,
    upstreamUrl: 'https://www.scummvm.org',
    accent: '#5a7e9d',
    tags: ['Adventure', 'Point & Click'],
  },
  {
    id: 'soh',
    title: 'Ship of Harkinian',
    shortTitle: 'SOH',
    summary: 'PC port of the Ocarina of Time engine',
    description:
      'A community-built native port with modern rendering, input, accessibility, and quality-of-life options.',
    artworkUrl: null,
    iconUrl: '/artwork/soh-icon.png',
    runtime: 'Native Linux',
    version: 'MacReady Golf',
    executablePath: null,
    upstreamUrl: 'https://www.shipofharkinian.com',
    accent: '#6a7750',
    tags: ['Adventure', 'Action'],
  },
  {
    id: 'zelda64recompiled',
    title: 'Zelda 64: Recompiled',
    shortTitle: 'Z64',
    summary: 'Static recompilation of Majora\'s Mask',
    description:
      'A native recompilation project with modern rendering, ultrawide support, and high frame-rate presentation.',
    artworkUrl: null,
    iconUrl: '/artwork/zelda64recompiled-icon.png',
    runtime: 'Native Linux',
    version: '1.2.2',
    executablePath: null,
    upstreamUrl: 'https://github.com/Zelda64Recomp/Zelda64Recomp',
    accent: '#765a88',
    tags: ['Adventure', 'Action'],
  },
];

const modCatalog: Array<Omit<Mod, 'enabled'>> = [
  {
    id: 'mod-openmw-tamriel-rebuilt',
    gameId: 'openmw',
    name: 'Tamriel Rebuilt',
    summary: 'Adds the Morrowind mainland with new regions and quests.',
    version: '24.12',
    author: 'Tamriel Rebuilt Team',
  },
  {
    id: 'mod-openmw-rebirth',
    gameId: 'openmw',
    name: 'Morrowind Rebirth',
    summary: 'Overhaul of landscapes, cities, and balance.',
    version: '7.0',
    author: 'trancemaster_198',
  },
  {
    id: 'mod-openrct2-openmusic',
    gameId: 'openrct2',
    name: 'OpenMusic',
    summary: 'Open-source ride and scenery music pack.',
    version: '1.2',
    author: 'OpenRCT2 Community',
  },
  {
    id: 'mod-openrct2-scenarios',
    gameId: 'openrct2',
    name: 'Classic Scenarios Pack',
    summary: 'Recreates the original RCT1 scenario lineup.',
    version: '2025.1',
    author: 'OpenRCT2 Community',
  },
  {
    id: 'mod-devilutionx-infernal',
    gameId: 'devilutionx',
    name: 'Infernal Difficulty',
    summary: 'Brutal difficulty rebalance for veteran players.',
    version: '0.9',
    author: 'Community',
  },
  {
    id: 'mod-soh-hd-textures',
    gameId: 'soh',
    name: 'HD Texture Pack',
    summary: 'High-resolution texture replacements.',
    version: '3.1',
    author: 'Community',
  },
];

function availableLibrary(): LibraryEntry[] {
  return games.map((game) => ({
    gameId: game.id,
    installState: 'available',
    installPath: null,
    playMinutes: 0,
  }));
}

function modLibrary(enabledModIds: string[]): Mod[] {
  return modCatalog.map((mod) => ({ ...mod, enabled: enabledModIds.includes(mod.id) }));
}

export const seedState: AppState = {
  activeProfileId: 'owner',
  selectedGameId: 'openrct2',
  route: 'library',
  profiles: [
    { id: 'owner', displayName: 'The Dictator', avatarInitials: 'TD' },
    { id: 'guest', displayName: 'Guest', avatarInitials: 'GU' },
  ],
  games,
  libraries: {
    owner: availableLibrary(),
    guest: availableLibrary(),
  },
  mods: {
    owner: modLibrary(['mod-openmw-tamriel-rebuilt']),
    guest: modLibrary([]),
  },
  downloads: [],
  saveSnapshots: [],
  cloudProvider: null,
};
