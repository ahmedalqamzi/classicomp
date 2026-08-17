import type { DownloadAsset, TrackedProject, TrackedProjectUpdate, TrackedRelease } from '../domain/types';
import { lookupGameMedia } from './media-connector';
import type { GameMedia } from './media-connector';

// Deterministic refresh ported from the Classic Game Ports tracker: only
// repository metadata and published releases are read, and a source failure
// preserves the last validated record instead of erasing it.

export interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponseLike>;

interface Repository {
  host: 'github' | 'gitlab';
  path: string;
}

const CONSUMER_PORT_TYPES: Array<TrackedProject['projectType']> = [
  'source-port',
  'static-recompilation',
  'hybrid',
];

// Anonymous GitHub API access allows 60 requests per hour and a project costs
// up to two core API requests (repo + releases), so a batch of 12 keeps even
// two initial-fill passes inside one rate-limit window (≤48 requests). The
// full catalog rotates through several scans like the original tracker did.
export const SCAN_BATCH_SIZE = 12;

export function selectScanBatch(
  projects: TrackedProject[],
  limit: number = SCAN_BATCH_SIZE,
): TrackedProject[] {
  return [...projects]
    .sort(
      (left, right) =>
        (left.lastCheckedAt ?? '').localeCompare(right.lastCheckedAt ?? '') ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

function failedUpdate(projectId: string, checkedAt: string): TrackedProjectUpdate {
  return {
    id: projectId,
    latestVersion: null,
    lastActivityAt: null,
    developmentState: null,
    downloadUrl: null,
    description: null,
    topics: null,
    screenshots: null,
    recentReleases: null,
    downloadAssets: null,
    coverUrl: null,
    coverAspect: null,
    coverChecked: false,
    checkedAt,
  };
}

const BADGE_IMAGE_PATTERN =
  /\b(shields|badgen|badge|workflows|discord|svg|logos?|favicon|icons?|settings?|controller|config|menu|diagram|chart|install|build|objdiff|launcher|gyro|extract|propert\w*|banner|title|dolphin)\b|#gh-(light|dark)-mode/;

function normalizeImageName(url: string): string {
  return url.toLowerCase().replace(/[-_./?#%]+/g, ' ');
}

// Screenshots travel with the tracker updates: the project's own README is
// the source, fetched from the raw CDN (no API budget).
export function extractReadmeImages(markdown: string, repoPath: string): string[] {
  const urls: string[] = [];
  const patterns = [/!\[[^\]]*\]\(([^)\s]+)/g, /<img[^>]+src=["']([^"']+)["']/gi];
  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      urls.push(match[1]);
    }
  }

  const resolved = urls
    .map((url) => {
      if (/^https?:\/\//i.test(url)) return url;
      const path = url.replace(/^\.?\//, '');
      return `https://raw.githubusercontent.com/${repoPath}/HEAD/${path}`;
    })
    .filter(
      (url) =>
        /\.(png|jpe?g|webp|gif)($|\?)/i.test(url) &&
        !BADGE_IMAGE_PATTERN.test(normalizeImageName(url)),
    );

  return [...new Set(resolved)].slice(0, 6);
}

async function readmeScreenshots(
  repoPath: string,
  fetchFn: FetchLike,
): Promise<string[] | null> {
  try {
    const response = await fetchFn(
      `https://raw.githubusercontent.com/${repoPath}/HEAD/README.md`,
    );
    if (!response.ok || typeof response.text !== 'function') return null;
    const images = extractReadmeImages(await response.text(), repoPath);
    return images.length > 0 ? images : null;
  } catch {
    return null;
  }
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}


// Archived is scan-owned in both directions: a repository that was recorded
// archived and is now unarchived gets an explicit reset (null would mean
// "preserve" and leave it archived forever).
function resolveDevelopmentState(
  project: TrackedProject,
  archived: boolean | undefined,
): TrackedProjectUpdate['developmentState'] {
  if (archived === true) return 'archived';
  if (archived === false && project.developmentState === 'archived') return 'unknown';
  return null;
}

// Real downloadable files from a release; checksums and metadata files are
// not downloads.
const NON_ASSET_PATTERN =
  /\.(sig|asc|sha\d*|md5|txt|json|yml|yaml|blockmap|zsync|pdb)($|\?)/i;

function extractAssets(
  assets: Array<{ name?: string; browser_download_url?: string; size?: number }> | undefined,
): DownloadAsset[] | null {
  if (!assets || assets.length === 0) return null;
  const files = assets
    .filter(
      (asset): asset is { name: string; browser_download_url: string; size?: number } =>
        Boolean(asset.name && asset.browser_download_url) &&
        !NON_ASSET_PATTERN.test(asset.name ?? ''),
    )
    .map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      sizeBytes: typeof asset.size === 'number' ? asset.size : null,
    }))
    .slice(0, 12);
  return files.length > 0 ? files : null;
}

function cleanTopics(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const topics = value.filter((topic): topic is string => typeof topic === 'string');
  return topics.length > 0 ? topics.slice(0, 12) : null;
}

export function parseRepository(repositoryUrl: string): Repository | null {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    return null;
  }

  const path = url.pathname.replace(/^\/|\/$/g, '');
  if (path.length === 0) return null;
  if (url.hostname === 'github.com') return { host: 'github', path };
  if (url.hostname === 'gitlab.com') return { host: 'gitlab', path };
  return null;
}

async function fetchJson(fetchFn: FetchLike, url: string): Promise<unknown | null> {
  const response = await fetchFn(url);
  return response.ok ? response.json() : null;
}

async function collectGithub(
  project: TrackedProject,
  path: string,
  fetchFn: FetchLike,
  checkedAt: string,
): Promise<TrackedProjectUpdate | null> {
  const apiRoot = `https://api.github.com/repos/${path}`;
  const metadata = (await fetchJson(fetchFn, apiRoot)) as {
    pushed_at?: string | null;
    archived?: boolean;
    description?: string | null;
    topics?: string[];
  } | null;
  if (!metadata) return null;

  let latestVersion: string | null = null;
  let downloadUrl: string | null = null;
  let recentReleases: TrackedRelease[] | null = null;
  let downloadAssets: DownloadAsset[] | null = null;
  if (CONSUMER_PORT_TYPES.includes(project.projectType)) {
    const releases = (await fetchJson(fetchFn, `${apiRoot}/releases?per_page=5`)) as Array<{
      tag_name?: string;
      html_url?: string;
      published_at?: string | null;
      draft?: boolean;
      prerelease?: boolean;
      assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
    }> | null;
    // Recompilation projects are early-stage by nature: many have never cut a
    // stable tag and ship every build as a prerelease. Discarding those
    // outright hid working Linux downloads for Bomberman Hero, Crash Team
    // Racing, Ace Combat 6 and Animal Crossing. So prefer stable releases and
    // fall back to prereleases only when there is no stable one — a project
    // that does cut stable tags still never advertises its betas.
    const usable = (releases ?? []).filter(
      (release) => release.tag_name && release.published_at && !release.draft,
    );
    const stable = usable.filter((release) => !release.prerelease);
    const published = stable.length > 0 ? stable : usable;
    latestVersion = published[0]?.tag_name ?? null;
    downloadUrl = published[0]?.html_url ?? null;
    downloadAssets = extractAssets(published[0]?.assets);
    recentReleases = published.length > 0
      ? published.map((release) => ({
          version: release.tag_name as string,
          url: release.html_url ?? `https://github.com/${path}/releases`,
          publishedAt: release.published_at ?? null,
        }))
      : null;
  }

  return {
    id: project.id,
    latestVersion,
    lastActivityAt: metadata.pushed_at ?? null,
    developmentState: resolveDevelopmentState(project, metadata.archived),
    downloadUrl,
    description: cleanDescription(metadata.description),
    topics: cleanTopics(metadata.topics),
    screenshots:
      project.screenshots.length === 0 ? await readmeScreenshots(path, fetchFn) : null,
    recentReleases,
    downloadAssets,
    coverUrl: null,
    coverAspect: null,
    coverChecked: false,
    checkedAt,
  };
}

async function collectGitlab(
  project: TrackedProject,
  path: string,
  fetchFn: FetchLike,
  checkedAt: string,
): Promise<TrackedProjectUpdate | null> {
  const apiRoot = `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`;
  const metadata = (await fetchJson(fetchFn, apiRoot)) as {
    last_activity_at?: string | null;
    archived?: boolean;
    description?: string | null;
    topics?: string[];
  } | null;
  if (!metadata) return null;

  let latestVersion: string | null = null;
  let downloadUrl: string | null = null;
  let recentReleases: TrackedRelease[] | null = null;
  if (CONSUMER_PORT_TYPES.includes(project.projectType)) {
    const releases = (await fetchJson(fetchFn, `${apiRoot}/releases?per_page=1`)) as Array<{
      tag_name?: string;
      released_at?: string | null;
    }> | null;
    const release = releases?.[0];
    latestVersion = release?.tag_name ?? null;
    downloadUrl = release?.tag_name
      ? `https://gitlab.com/${path}/-/releases/${encodeURIComponent(release.tag_name)}`
      : null;
    recentReleases = release?.tag_name
      ? [{
          version: release.tag_name,
          url: `https://gitlab.com/${path}/-/releases/${encodeURIComponent(release.tag_name)}`,
          publishedAt: release.released_at ?? null,
        }]
      : null;
  }

  return {
    id: project.id,
    latestVersion,
    lastActivityAt: metadata.last_activity_at ?? null,
    developmentState: resolveDevelopmentState(project, metadata.archived),
    downloadUrl,
    description: cleanDescription(metadata.description),
    topics: cleanTopics(metadata.topics),
    screenshots: null,
    recentReleases,
    downloadAssets: null,
    coverUrl: null,
    coverAspect: null,
    coverChecked: false,
    checkedAt,
  };
}

async function collectProject(
  project: TrackedProject,
  fetchFn: FetchLike,
  checkedAt: string,
): Promise<TrackedProjectUpdate | null> {
  const repository = parseRepository(project.repositoryUrl);
  if (!repository) return null;

  return repository.host === 'github'
    ? collectGithub(project, repository.path, fetchFn, checkedAt)
    : collectGitlab(project, repository.path, fetchFn, checkedAt);
}

export async function collectTrackingUpdates(
  projects: TrackedProject[],
  fetchFn: FetchLike = (url, init) => fetch(url, init),
  now: () => string = () => new Date().toISOString(),
): Promise<TrackedProjectUpdate[]> {
  const checkedAt = now();
  const results = await Promise.all(
    projects.map(async (project) => {
      try {
        return await collectProject(project, fetchFn, checkedAt);
      } catch {
        return null;
      }
    }),
  );

  if (projects.length > 0 && results.every((result) => result === null)) {
    throw new Error('No tracking source could be reached.');
  }

  const updates = results.map(
    // A failed source keeps its stored record but is still marked checked, so
    // a persistently broken repository cannot hog the rotating batch.
    (result, index) => result ?? failedUpdate(projects[index].id, checkedAt),
  );

  // Media rides along with every tracker update: games still missing a cover
  // get one looked up through the media connector (Wikipedia page images),
  // including gameplay screenshots when the connector provides them and the
  // project has none of its own. Games whose galleries are seed captures
  // only (libretro snaps, README shots) additionally get an HD gallery
  // appended — IGDB when credentials are configured, Steam's keyless
  // storefront otherwise.
  const isHdShot = (url: string) =>
    url.includes('steamstatic.com') || url.includes('images.igdb.com');
  const mediaTargets = new Map<string, TrackedProject>();
  const coverTargets = new Set<string>();
  for (const project of projects) {
    // Missing covers get a lookup; covers without a stored aspect predate
    // validation and get re-evaluated, so bad art self-corrects.
    const needsCover = project.coverUrl === null || project.coverAspect === null;
    if (needsCover) coverTargets.add(project.gameKey);
    const needsHdShots = !project.screenshots.some(isHdShot);
    if ((needsCover || needsHdShots) && !mediaTargets.has(project.gameKey)) {
      mediaTargets.set(project.gameKey, project);
    }
  }
  const mediaByGame = new Map<string, GameMedia>();
  await Promise.all(
    [...mediaTargets.entries()].map(async ([gameKey, project]) => {
      try {
        mediaByGame.set(
          gameKey,
          await lookupGameMedia(
            project.gameTitle,
            project.gameShortTitle,
            fetchFn,
            coverTargets.has(gameKey),
            undefined,
            project.originalReleaseYear || null,
          ),
        );
      } catch {
        // Missing media never blocks the scan.
      }
    }),
  );

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  for (const update of updates) {
    const project = projectsById.get(update.id);
    if (!project) continue;
    const media = mediaByGame.get(project.gameKey);
    if (!media) continue;
    // Cover fields only apply to games that actually needed a cover; a
    // screenshots-only lookup must not clobber validated art with a re-fetch.
    if (coverTargets.has(project.gameKey)) {
      update.coverUrl = media.coverUrl;
      update.coverAspect = media.coverAspect;
      update.coverChecked = true;
    }
    const baseShots = update.screenshots ?? project.screenshots;
    if (media.screenshots.length > 0) {
      if (baseShots.length === 0) {
        update.screenshots = media.screenshots;
      } else if (!baseShots.some(isHdShot) && media.screenshots.some(isHdShot)) {
        // Seeded captures lead the gallery; the HD pulls fill in after.
        update.screenshots = [
          ...new Set([...baseShots, ...media.screenshots.filter(isHdShot)]),
        ].slice(0, 10);
      }
    }
  }

  return updates;
}
