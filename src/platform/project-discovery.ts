import type { TrackedProject } from '../domain/types';
import type { FetchLike } from './tracking-collector';

// Automatic store growth: each scan pass runs one GitHub repository search
// from a rotating query list and adds unknown, plausible reverse-engineering
// projects to the catalog. New records start as "Catalogued; verification
// queued" and the regular scans then fill in their facts — mirroring how the
// Classic Game Ports tracker treated search as a supplemental source.

const DISCOVERY_QUERIES = [
  'topic:decompilation game stars:>=30',
  'topic:recompilation stars:>=15',
  '"static recompilation" game stars:>=15 in:name,description,readme',
  'game decompilation stars:>=75 in:name,description',
];

export const MAX_DISCOVERIES_PER_PASS = 5;

interface SearchRepo {
  full_name?: string;
  name?: string;
  description?: string | null;
  html_url?: string;
  pushed_at?: string | null;
  archived?: boolean;
  fork?: boolean;
  topics?: string[];
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Repos whose derived titles are wrong or unreadable get the real game name
// here, keyed by discovered id. Exported so the stores can retitle records
// discovered by earlier builds.
const igdbCover = (id: string) =>
  `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg`;
const igdbShots = (ids: string[]) =>
  ids.map((id) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`);

export const DISCOVERED_TITLE_FIXES: Record<
  string,
  {
    gameTitle: string;
    gameShortTitle?: string;
    originalReleaseYear?: number;
    // Curated IGDB media (year-verified by hand); fills records whose
    // repo-derived titles matched nothing a lookup could trust.
    coverUrl?: string;
    screenshots?: string[];
  }
> = {
  'discovered-krystalgamer-spidey-decomp': {
    gameTitle: 'Spider-Man (2000)',
    gameShortTitle: 'Spider-Man',
    originalReleaseYear: 2000,
    coverUrl: igdbCover('co2xxq'),
    screenshots: igdbShots([
      'uwgtdo8gcopapq74jpab',
      'hew7hnaqumhhqnuxwhla',
      'jalajzvpftfp3ritbdka',
      'hwjwty8e3nzuk6m9rlrt',
    ]),
  },
  'discovered-doyagu-ballanced': {
    gameTitle: 'Ballance',
    originalReleaseYear: 2004,
    coverUrl: igdbCover('co9trv'),
    screenshots: igdbShots(['scli89', 'scli88', 'scli8k', 'scli8c']),
  },
  'discovered-spacefarergames-aloneinthedarkrehaunted': {
    gameTitle: 'Alone in the Dark',
    originalReleaseYear: 1992,
    coverUrl: igdbCover('co82bd'),
    screenshots: igdbShots(['scs3dc', 'scs3dd', 'scs3da', 'scs3db']),
  },
  'discovered-sat-r-sa2': {
    gameTitle: 'Sonic Adventure 2',
    originalReleaseYear: 2001,
    coverUrl: igdbCover('cobqpd'),
    screenshots: igdbShots(['scjgo3', 'scjgo4', 'scjgo5', 'scjgo6']),
  },
  'discovered-mmzret-rmz3': {
    gameTitle: 'Mega Man Zero 3',
    originalReleaseYear: 2004,
    coverUrl: igdbCover('co204h'),
    screenshots: igdbShots([
      'nteofykfuaybc09do0x7',
      'mtyqdksc2tis2wmgacrx',
      'dbe0far9jbiaoizgsdsc',
      'q4dzajzfk4nln0amec8z',
    ]),
  },
  'discovered-herringway-ebsrc': {
    gameTitle: 'EarthBound',
    originalReleaseYear: 1994,
    coverUrl: igdbCover('co6v07'),
    screenshots: igdbShots(['sc78jl', 'sc78jn', 'f3k5vdt7h8zhfitudsdh', 'scftzl']),
  },
};

// Curated repos, tooling, and "awesome" lists match the search queries but
// are not games; never catalog them.
export const NON_GAME_REPO_PATTERN = /awesome|(^|-)lists?($|-)|collection|resources/i;

// "sm64-port" -> "Sm64 Port"-style prettifying with re-comp suffixes dropped
// and CamelCase repo names ("AloneInTheDarkReHaunted") split into words.
function gameTitleFromRepoName(name: string): string {
  const stripped = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]?(decompilation|decomp|recompilation|recompiled|recomp|reversed?|re)$/i, '')
    .replace(/^(open|re)[-_]?/i, (match) => match)
    .replace(/[-_.]+/g, ' ')
    .trim();
  const base = stripped.length >= 3 ? stripped : name.replace(/[-_.]+/g, ' ');
  return base
    .split(' ')
    .filter(Boolean)
    .map((word) => (word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(' ');
}

function guessProjectType(repo: SearchRepo): TrackedProject['projectType'] {
  const haystack = `${repo.name ?? ''} ${(repo.topics ?? []).join(' ')}`.toLowerCase();
  if (haystack.includes('recomp')) return 'static-recompilation';
  if (haystack.includes('port')) return 'source-port';
  return 'decompilation';
}

function toDiscoveredProject(repo: SearchRepo): TrackedProject | null {
  if (!repo.full_name || !repo.html_url || !repo.name) return null;
  if (repo.archived || repo.fork) return null;
  if (NON_GAME_REPO_PATTERN.test(repo.name)) return null;
  const description = repo.description?.trim();
  if (!description) return null;

  const id = `discovered-${slugify(repo.full_name)}`;
  const fix = DISCOVERED_TITLE_FIXES[id];
  const gameTitle = fix?.gameTitle ?? gameTitleFromRepoName(repo.name);
  return {
    id,
    gameKey: slugify(gameTitle),
    gameTitle,
    gameShortTitle: fix?.gameShortTitle ?? gameTitle,
    gameId: null,
    description,
    projectName: repo.name,
    projectType: guessProjectType(repo),
    developmentState: 'unknown',
    stability: 'unknown',
    completionPercent: null,
    completionLabel: 'Catalogued; verification queued',
    originalReleaseYear: fix?.originalReleaseYear ?? 0,
    originalPlatforms: [],
    targetPlatforms: [],
    latestVersion: null,
    lastActivityAt: repo.pushed_at ?? null,
    lastCheckedAt: null,
    downloadUrl: null,
    coverUrl: null,
    coverAspect: null,
    screenshots: [],
    topics: (repo.topics ?? []).slice(0, 12),
    recentReleases: [],
    downloadAssets: [],
    repositoryUrl: repo.html_url,
  };
}

export async function discoverNewProjects(
  existing: TrackedProject[],
  fetchFn: FetchLike = (url) => fetch(url),
  queryIndex: number = Math.floor(Date.now() / 86_400_000) % DISCOVERY_QUERIES.length,
): Promise<TrackedProject[]> {
  const query = DISCOVERY_QUERIES[queryIndex % DISCOVERY_QUERIES.length];
  const response = await fetchFn(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=15`,
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { items?: SearchRepo[] };

  const knownIds = new Set(existing.map((project) => project.id));
  const knownRepos = new Set(existing.map((project) => project.repositoryUrl.toLowerCase()));

  const discovered: TrackedProject[] = [];
  for (const repo of body.items ?? []) {
    const project = toDiscoveredProject(repo);
    if (!project) continue;
    if (knownIds.has(project.id)) continue;
    if (knownRepos.has(project.repositoryUrl.toLowerCase())) continue;
    discovered.push(project);
    if (discovered.length >= MAX_DISCOVERIES_PER_PASS) break;
  }
  return discovered;
}
