import type { AppState, Game, TrackedProject } from './types';

export type TrackedAvailability =
  | 'released'
  | 'playable'
  | 'in-development'
  | 'source-only'
  | 'inactive'
  | 'unknown';

export interface TrackedGame {
  gameKey: string;
  gameTitle: string;
  gameShortTitle: string;
  originalReleaseYear: number;
  originalPlatforms: string[];
  availability: TrackedAvailability;
  latestActivityAt: string | null;
  description: string | null;
  coverUrl: string | null;
  projects: TrackedProject[];
}

export interface TrackingFilters {
  query: string;
  availability: 'all' | TrackedAvailability;
  watchedOnly: boolean;
  // Original-platform chip filter; null shows every platform.
  platform: string | null;
}

export const EMPTY_TRACKING_FILTERS: TrackingFilters = {
  query: '',
  availability: 'all',
  watchedOnly: false,
  platform: null,
};

export const AVAILABILITY_LABELS: Record<TrackedAvailability, string> = {
  released: 'Released',
  playable: 'Playable',
  'in-development': 'In development',
  'source-only': 'Source only',
  inactive: 'Inactive',
  unknown: 'Unknown',
};

export const PROJECT_TYPE_LABELS: Record<TrackedProject['projectType'], string> = {
  decompilation: 'Decompilation',
  'matching-decompilation': 'Matching decompilation',
  'static-recompilation': 'Static recompilation',
  'source-port': 'Source port',
  hybrid: 'Hybrid',
};

// Engine/runtime entries track a body of games rather than being one game
// (ScummVM spans hundreds of adventure titles); they are not store products.
const NON_PRODUCT_GAME_KEYS = new Set(['classic-adventure-engines']);

// A game earns a storefront listing only once someone can actually play it:
// a stable or playable consumer build. Source-only decompilations and
// in-development ports stay tracked (scans keep watching them) but are not
// shown as store products until they cross this line.
// Only a handful of games are seeded with a hand-authored library record; the
// rest of the catalogue is discovered by scanning, and those projects carry no
// gameId at all. Downloading one still has to put something in the library, so
// the library record is derived from the tracked project itself. The id falls
// back to gameKey, which is stable across sessions and shared by every project
// that reimplements the same game — so two ports of one title land on one
// library entry rather than two.
export function libraryGameId(project: TrackedProject): string {
  return project.gameId ?? project.gameKey;
}

// An update is only claimed when both versions are known and differ. A null
// installedVersion means the install predates version tracking, and calling
// that stale would nag every existing library entry once, forever.
export function updateAvailable(
  entry: { installState: string; installedVersion: string | null },
  projects: TrackedProject[],
): string | null {
  if (entry.installState !== 'installed' || entry.installedVersion === null) return null;
  const latest = projects.map((project) => project.latestVersion).find(Boolean) ?? null;
  return latest !== null && latest !== entry.installedVersion ? latest : null;
}

export function gameFromTrackedProject(project: TrackedProject): Game {
  let hash = 0;
  for (let index = 0; index < project.gameKey.length; index += 1) {
    hash = (hash * 31 + project.gameKey.charCodeAt(index)) >>> 0;
  }
  return {
    id: libraryGameId(project),
    title: project.gameTitle,
    shortTitle: project.gameShortTitle,
    summary: `Played through ${project.projectName}`,
    description: project.description ?? '',
    artworkUrl: project.coverUrl,
    iconUrl: null,
    runtime: project.targetPlatforms[0] ?? 'Native',
    version: project.latestVersion ?? '—',
    // Nothing is installed at this point; the installer fills this in.
    executablePath: null,
    upstreamUrl: project.repositoryUrl,
    accent: `hsl(${hash % 360} 48% 30%)`,
    tags: project.topics.slice(0, 4),
  };
}

export function isStorefrontReady(game: TrackedGame): boolean {
  if (NON_PRODUCT_GAME_KEYS.has(game.gameKey)) return false;
  return game.availability === 'released' || game.availability === 'playable';
}

const AVAILABILITY_RANK: Record<TrackedAvailability, number> = {
  released: 6,
  playable: 5,
  'in-development': 4,
  'source-only': 3,
  inactive: 2,
  unknown: 1,
};

export function projectAvailability(project: TrackedProject): TrackedAvailability {
  const isConsumerPort = ['source-port', 'static-recompilation', 'hybrid'].includes(
    project.projectType,
  );
  if (!isConsumerPort) return 'source-only';
  if (project.stability === 'stable') return 'released';
  if (project.stability === 'playable') return 'playable';
  // Publishing releases is release evidence on its own — a port whose
  // stability has not been verified yet must not present as unreleased.
  // Curated verdicts (experimental/boots) still outrank it below.
  if (
    project.stability === 'unknown' &&
    project.latestVersion !== null &&
    project.developmentState !== 'archived' &&
    project.developmentState !== 'dormant'
  ) {
    return 'released';
  }
  if (
    project.stability === 'boots' ||
    project.stability === 'experimental' ||
    project.developmentState === 'active' ||
    project.developmentState === 'maintenance' ||
    project.developmentState === 'paused'
  ) {
    return 'in-development';
  }
  if (project.developmentState === 'archived' || project.developmentState === 'dormant') {
    return 'inactive';
  }
  if (project.developmentState === 'completed' && project.latestVersion) return 'released';
  return 'unknown';
}

export function groupTrackedProjects(projects: TrackedProject[]): TrackedGame[] {
  const games = new Map<string, TrackedGame>();

  for (const project of projects) {
    const existing = games.get(project.gameKey);
    if (!existing) {
      games.set(project.gameKey, {
        gameKey: project.gameKey,
        gameTitle: project.gameTitle,
        gameShortTitle: project.gameShortTitle,
        originalReleaseYear: project.originalReleaseYear,
        originalPlatforms: project.originalPlatforms,
        availability: projectAvailability(project),
        latestActivityAt: project.lastActivityAt,
        description: project.description,
        coverUrl: project.coverUrl,
        projects: [project],
      });
      continue;
    }

    const availability = projectAvailability(project);
    if (AVAILABILITY_RANK[availability] > AVAILABILITY_RANK[existing.availability]) {
      existing.availability = availability;
    }
    if (
      project.lastActivityAt &&
      (!existing.latestActivityAt || project.lastActivityAt > existing.latestActivityAt)
    ) {
      existing.latestActivityAt = project.lastActivityAt;
    }
    existing.originalPlatforms = [
      ...new Set([...existing.originalPlatforms, ...project.originalPlatforms]),
    ];
    existing.description = existing.description ?? project.description;
    existing.coverUrl = existing.coverUrl ?? project.coverUrl;
    existing.projects.push(project);
  }

  return [...games.values()].sort((left, right) => left.gameTitle.localeCompare(right.gameTitle));
}

export function filterTrackedGames(
  games: TrackedGame[],
  filters: TrackingFilters,
  watchedGameKeys: ReadonlySet<string>,
): TrackedGame[] {
  const query = filters.query.trim().toLowerCase();

  return games.filter((game) => {
    if (query.length > 0) {
      const haystack = [
        game.gameTitle,
        game.gameShortTitle,
        ...game.projects.map((project) => project.projectName),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.platform !== null && !game.originalPlatforms.includes(filters.platform)) {
      return false;
    }

    if (filters.availability !== 'all' && game.availability !== filters.availability) {
      return false;
    }

    if (filters.watchedOnly && !watchedGameKeys.has(game.gameKey)) return false;

    return true;
  });
}

// The page a Download button leads to: the exact release captured by the last
// scan when available, otherwise the project's releases page when it is known
// to publish releases at all.
export function projectDownloadUrl(project: TrackedProject): string | null {
  if (project.downloadUrl) return project.downloadUrl;
  if (!project.latestVersion) return null;
  return project.repositoryUrl.includes('gitlab.com')
    ? `${project.repositoryUrl}/-/releases`
    : `${project.repositoryUrl}/releases/latest`;
}

// Every hosted project has one real downloadable artifact even before its
// first release: the source archive of the default branch.
export function sourceArchiveUrl(project: TrackedProject): string | null {
  if (project.repositoryUrl.includes('github.com')) {
    return `${project.repositoryUrl}/archive/HEAD.zip`;
  }
  if (project.repositoryUrl.includes('gitlab.com')) {
    return `${project.repositoryUrl}/-/archive/HEAD/source.zip`;
  }
  return null;
}

export const OPENGRAPH_CARD_HOST = 'opengraph.githubassets.com';

export function isOpenGraphCardUrl(url: string): boolean {
  return url.startsWith(`https://${OPENGRAPH_CARD_HOST}/`);
}

// Pulled artwork: GitHub renders an OpenGraph card image for every public
// repository at a constructable URL, so capsules get real art without storing
// or fetching anything ahead of time. Non-GitHub hosts fall back to generated
// capsule art in the UI.
export function projectArtworkUrl(project: TrackedProject): string | null {
  let url: URL;
  try {
    url = new URL(project.repositoryUrl);
  } catch {
    return null;
  }
  if (url.hostname !== 'github.com') return null;
  const path = url.pathname.replace(/^\/|\/$/g, '');
  if (!path.includes('/')) return null;
  return `https://${OPENGRAPH_CARD_HOST}/classicomp/${path}`;
}

export function selectWatchedGameKeys(
  state: Pick<AppState, 'activeProfileId' | 'watchlists'>,
): Set<string> {
  if (state.activeProfileId === null) return new Set();
  return new Set(state.watchlists[state.activeProfileId] ?? []);
}
