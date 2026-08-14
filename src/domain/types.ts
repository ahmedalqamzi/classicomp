export type AppRoute = 'library' | 'catalog' | 'mods';
export type InstallState = 'installed' | 'available' | 'queued' | 'downloading';
export type DownloadState = 'queued' | 'downloading' | 'paused' | 'complete';
export type SaveState = 'local' | 'synced' | 'conflict';

export interface Profile {
  id: string;
  displayName: string;
  avatarInitials: string;
}

export interface Game {
  id: string;
  title: string;
  shortTitle: string;
  summary: string;
  description: string;
  artworkUrl: string | null;
  iconUrl: string | null;
  runtime: string;
  version: string;
  executablePath: string | null;
  upstreamUrl: string;
  accent: string;
  tags: string[];
}

export interface Mod {
  id: string;
  gameId: string;
  name: string;
  summary: string;
  version: string;
  author: string;
  enabled: boolean;
}

export interface LibraryEntry {
  gameId: string;
  installState: InstallState;
  installPath: string | null;
  playMinutes: number;
}

export interface Download {
  id: string;
  profileId: string;
  gameId: string;
  state: DownloadState;
  progress: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
}

export interface SaveSnapshot {
  id: string;
  profileId: string;
  gameId: string;
  deviceName: string;
  createdAt: string;
  state: SaveState;
  localPath: string;
}

export interface AppState {
  activeProfileId: string | null;
  selectedGameId: string;
  route: AppRoute;
  profiles: Profile[];
  games: Game[];
  libraries: Record<string, LibraryEntry[]>;
  mods: Record<string, Mod[]>;
  downloads: Download[];
  saveSnapshots: SaveSnapshot[];
  cloudProvider: string | null;
}

export type AppAction =
  | { type: 'profile/activate'; profileId: string }
  | { type: 'profile/signOut' }
  | { type: 'mod/toggle'; modId: string }
  | { type: 'route/change'; route: AppRoute }
  | { type: 'game/select'; gameId: string }
  | { type: 'install/queue'; gameId: string };
