export type AppRoute = 'library' | 'store' | 'mods' | 'roadmap';
export type InstallState = 'installed' | 'downloaded' | 'available' | 'queued' | 'downloading';
export type DownloadState = 'queued' | 'downloading' | 'paused' | 'complete';
export type SaveState = 'local' | 'synced' | 'conflict';
export type ProjectType =
  | 'decompilation'
  | 'matching-decompilation'
  | 'static-recompilation'
  | 'source-port'
  | 'hybrid';
export type DevelopmentState =
  | 'unknown'
  | 'active'
  | 'maintenance'
  | 'paused'
  | 'dormant'
  | 'archived'
  | 'completed';
export type ProjectStability = 'experimental' | 'boots' | 'playable' | 'stable' | 'unknown';

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
  // Recompilations and decompilations ship no game content — they need the
  // player's own original copy. This records the file the player linked, and
  // it is what gates Play: null means setup is still outstanding.
  romPath: string | null;
  // The release artifact as downloaded (a zip, an AppImage, a Flatpak bundle)
  // sitting in the downloads folder. Installing consumes this; installPath is
  // the runnable thing that comes out of it, so the two never mean the same
  // thing at the same time.
  downloadedFile: string | null;
  // The project version this install came from. Comparing it against the
  // scanned latestVersion is how an available update is detected; null means
  // the install predates version tracking, so it is never called stale.
  installedVersion: string | null;
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

export interface TrackedRelease {
  version: string;
  url: string;
  publishedAt: string | null;
}

// A directly downloadable file from a project's latest release.
export interface DownloadAsset {
  name: string;
  url: string;
  sizeBytes: number | null;
}

export interface TrackedProject {
  id: string;
  gameKey: string;
  gameTitle: string;
  gameShortTitle: string;
  gameId: string | null;
  description: string | null;
  projectName: string;
  projectType: ProjectType;
  developmentState: DevelopmentState;
  stability: ProjectStability;
  completionPercent: number | null;
  completionLabel: string;
  originalReleaseYear: number;
  originalPlatforms: string[];
  targetPlatforms: string[];
  latestVersion: string | null;
  lastActivityAt: string | null;
  lastCheckedAt: string | null;
  downloadUrl: string | null;
  coverUrl: string | null;
  coverAspect: number | null;
  screenshots: string[];
  topics: string[];
  recentReleases: TrackedRelease[];
  downloadAssets: DownloadAsset[];
  repositoryUrl: string;
}

// One refresh result for a tracked project; null fields mean the source
// offered no new evidence and the stored value must be preserved.
// checkedAt marks that the source was part of this scan pass, which drives
// the rotating batch order.
export interface TrackedProjectUpdate {
  id: string;
  latestVersion: string | null;
  lastActivityAt: string | null;
  developmentState: DevelopmentState | null;
  downloadUrl: string | null;
  description: string | null;
  topics: string[] | null;
  screenshots: string[] | null;
  recentReleases: TrackedRelease[] | null;
  downloadAssets: DownloadAsset[] | null;
  coverUrl: string | null;
  coverAspect: number | null;
  // True when the media connector actually evaluated this game's cover in
  // this pass — it makes cover replacement tri-state: unchecked preserves,
  // checked-null clears a bad cover, checked-value replaces.
  coverChecked: boolean;
  checkedAt: string | null;
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

// A game modification pulled live from its hosting site (currently GitHub
// search); not persisted in AppState.
export interface LiveMod {
  id: string;
  gameId: string;
  name: string;
  summary: string;
  url: string;
  author: string;
  stars: number;
  updatedAt: string | null;
}

// A friend on the connected Classicomp account (Supabase-backed).
export interface Friend {
  id: string;
  displayName: string;
  email: string;
  status: 'online' | 'offline' | 'pending';
}

// A new release for a wishlisted game, surfaced Steam-style in the header.
export interface ReleaseNotice {
  id: string;
  gameKey: string;
  gameShortTitle: string;
  version: string;
  url: string | null;
  noticedAt: string;
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
  trackedProjects: TrackedProject[];
  watchlists: Record<string, string[]>;
  releaseNotices: ReleaseNotice[];
  trackingLastScanAt: string | null;
  cloudProvider: string | null;
}

export type AppAction =
  | { type: 'profile/activate'; profileId: string }
  | { type: 'profile/signOut' }
  | { type: 'mod/toggle'; modId: string }
  | { type: 'route/change'; route: AppRoute }
  | { type: 'game/select'; gameId: string }
  | {
      type: 'install/queue';
      gameId: string;
      // Library record for a scanned project that has no seeded game. Passed
      // on first download so the entry has something to render.
      game?: Game;
    }
  | { type: 'tracking/toggleWatch'; gameKey: string }
  | { type: 'tracking/applyUpdates'; updates: TrackedProjectUpdate[]; scannedAt: string }
  | { type: 'tracking/addProjects'; projects: TrackedProject[] }
  | {
      type: 'download/setState';
      downloadId: string;
      state: DownloadState;
      progress?: number;
      // The saved file's name, known only to the caller that streamed it. On
      // completion it becomes the entry's installPath, which is what Play
      // later hands to the desktop opener.
      fileName?: string;
    }
  | { type: 'library/uninstall'; gameId: string }
  | { type: 'library/setRom'; gameId: string; romPath: string | null }
  | {
      type: 'library/setInstalled';
      gameId: string;
      launchTarget: string;
      installedVersion: string | null;
    }
  | { type: 'notices/dismiss'; noticeId: string };
