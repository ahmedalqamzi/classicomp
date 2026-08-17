import { ArrowLeft, Check, ExternalLink, Heart } from 'lucide-react';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  AVAILABILITY_LABELS,
  PROJECT_TYPE_LABELS,
  isOpenGraphCardUrl,
  libraryGameId,
  projectArtworkUrl,
  projectDownloadUrl,
  sourceArchiveUrl,
} from '../domain/tracking';
import type { TrackedGame } from '../domain/tracking';
import type { DownloadAsset, LibraryEntry, LiveMod, TrackedProject, TrackedRelease } from '../domain/types';
import { bestAssetFor } from '../platform/downloader';
import { ProjectDownloadControl } from './download-control';
import type { ProjectInstallState } from './download-control';
import { LiveModCard } from './mods-view';

export const CONSUMER_PORT_TYPES: Array<TrackedProject['projectType']> = [
  'source-port',
  'static-recompilation',
  'hybrid',
];

const SCREENSHOT_LIMIT = 10;
const TOPIC_LIMIT = 12;
const RELEASE_FEED_LIMIT = 8;

const MULTIPLAYER_TOPICS = ['multiplayer', 'online', 'co-op', 'coop', 'netplay'];

// Every implementation gets a setup guide; the steps depend on whether a
// packaged build exists and on how the project reproduces the game. All of
// them need the player's own original copy — the guide says so explicitly.
const ORIGINAL_COPY_NOTE =
  'You need your own copy of the original game — no game content is included.';

export function setupSteps(project: TrackedProject, hasPackagedDownload: boolean): string[] {
  if (hasPackagedDownload) {
    switch (project.projectType) {
      case 'source-port':
        return [
          'Download the release for your platform and unpack it.',
          'On first launch, point it at your original game data files.',
          ORIGINAL_COPY_NOTE,
        ];
      case 'static-recompilation':
        return [
          'Download the release and unpack it.',
          'Provide your original game copy when prompted so assets can be extracted.',
          ORIGINAL_COPY_NOTE,
        ];
      default:
        return [
          'Download the release build.',
          'Supply your original ROM or game files to generate the game assets.',
          ORIGINAL_COPY_NOTE,
        ];
    }
  }
  switch (project.projectType) {
    case 'decompilation':
    case 'matching-decompilation':
      return [
        'Download the source archive or clone the repository.',
        'Install the build toolchain listed in the project README.',
        'Place your original ROM where the README names it, then run the documented build command.',
        ORIGINAL_COPY_NOTE,
      ];
    case 'static-recompilation':
      return [
        'Download the source archive or clone the repository.',
        'Follow the README to run the recompiler against your original game copy.',
        ORIGINAL_COPY_NOTE,
      ];
    default:
      return [
        'Download the source archive or clone the repository.',
        'Build it per the project README, then point it at your original game data.',
        ORIGINAL_COPY_NOTE,
      ];
  }
}

// Generated capsule art derives a stable accent gradient from the title, so a
// game always keeps the same colors between sessions.
function titleHue(title: string): number {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

export function capsuleGradient(title: string): string {
  const hue = titleHue(title);
  return `linear-gradient(135deg, hsl(${hue} 48% 30%) 0%, hsl(${(hue + 42) % 360} 58% 13%) 100%)`;
}

function titleInitials(title: string): string {
  const words = title.split(/\s+/).filter((word) => /^[a-z0-9]/i.test(word));
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

// Retro captures are tiny (320×240-ish PNGs from the libretro database);
// upscaling them with smooth interpolation looks muddy, so only shots whose
// natural size is genuinely small render with crisp pixels. Large captures
// (the 1280×720 YouTube/Steam pulls) get normal smooth scaling.
function markLowResShot(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  img.classList.toggle('shot-lowres', img.naturalWidth > 0 && img.naturalWidth <= 480);
}

function firstCoverUrl(game: TrackedGame): string | null {
  return game.coverUrl ?? game.projects.find((project) => project.coverUrl)?.coverUrl ?? null;
}

export function localArtworkUrl(
  game: TrackedGame,
  localArt: ReadonlyMap<string, string>,
): string | null {
  for (const project of game.projects) {
    if (project.gameId && localArt.has(project.gameId)) {
      return localArt.get(project.gameId) ?? null;
    }
  }
  return null;
}

// Artwork priority everywhere a game is shown large: pulled box art, then
// the built-in local artwork. GitHub OpenGraph repo cards are never game
// art — cropped into a cover slot they read as broken pages — so games
// without real art fall through to the generated gradient instead.
export function storeArtCandidates(
  game: TrackedGame,
  localArt: ReadonlyMap<string, string>,
): string[] {
  return [firstCoverUrl(game), localArtworkUrl(game, localArt)].filter(
    (url): url is string => url !== null,
  );
}

// Browse rows skip OpenGraph cards: they are large remote images and would
// fire once per visible row. Box art and local art are cheap enough here.
export function browseArtCandidates(
  game: TrackedGame,
  localArt: ReadonlyMap<string, string>,
): string[] {
  return [firstCoverUrl(game), localArtworkUrl(game, localArt)].filter(
    (url): url is string => url !== null,
  );
}

// Aspect (width/height) of the game's chosen cover — firstCoverUrl picks this
// same project — so portrait slots can tell portrait box art from landscape
// box scans. Null means no cover or an unvalidated one.
export function gameCoverAspect(game: TrackedGame): number | null {
  if (game.coverUrl === null) return null;
  return (
    game.projects.find((project) => project.coverUrl === game.coverUrl)?.coverAspect ?? null
  );
}

interface ArtImageProps {
  candidates: string[];
  lazy?: boolean;
  // Aspect of candidates[0] when it is a validated cover; only art whose
  // aspect is wildly off the portrait slot changes the treatment.
  coverAspect?: number | null;
}

// Renders the first working candidate cropped to fill its slot — Steam never
// letterboxes, so the default is object-fit: cover. The one exception is a
// validated cover whose aspect is wildly off the 2:3 portrait slot (a
// landscape box scan, a square-ish logo cover): it sits contained over a
// blurred copy of itself, so every capsule still fills the same box instead
// of floating as a small island on the gradient. The gradient shows through
// only when every candidate fails.
// OpenGraph cards get the `art-frame-og` marker so CSS can tint the white
// GitHub card into the dark theme; real covers stay full color.
export function ArtImage({ candidates, lazy = false, coverAspect = null }: ArtImageProps) {
  const [failedCount, setFailedCount] = useState(0);
  const src = candidates[failedCount] ?? null;
  if (src === null) return null;
  const advance = () => setFailedCount((count) => count + 1);
  const contained = failedCount === 0 && coverAspect !== null && coverAspect > 0.85;
  const frameClass = `art-frame${isOpenGraphCardUrl(src) ? ' art-frame-og' : ''}${contained ? ' art-frame-fill' : ''}`;
  return (
    <span className={frameClass}>
      {contained ? (
        <img alt="" aria-hidden="true" className="art-backdrop" loading={lazy ? 'lazy' : undefined} src={src} />
      ) : null}
      <img
        alt=""
        loading={lazy ? 'lazy' : undefined}
        src={src}
        onError={advance}
      />
    </span>
  );
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function CapsuleThumb({ art, title }: { art: string[]; title: string }) {
  return (
    <span
      aria-hidden="true"
      className="capsule-thumb"
      style={{ background: capsuleGradient(title) }}
    >
      {art.length > 0 ? <ArtImage candidates={art} lazy /> : null}
      {art.length > 0 ? null : <span>{titleInitials(title)}</span>}
    </span>
  );
}

interface InLibraryButtonProps {
  gameId: string;
  // The owned item is the GAME, so that is what the button announces — the
  // build that runs it is named elsewhere on the row.
  gameName: string;
  onOpenInLibrary(gameId: string): void;
  tabIndex?: number;
}

export function InLibraryButton({ gameId, gameName, onOpenInLibrary, tabIndex }: InLibraryButtonProps) {
  return (
    <button
      aria-label={`Open ${gameName} in library`}
      className="in-library-action"
      tabIndex={tabIndex}
      type="button"
      onClick={() => onOpenInLibrary(gameId)}
    >
      <Check aria-hidden="true" size={12} />
      In library
    </button>
  );
}

export function gameScreenshots(game: TrackedGame): string[] {
  return [...new Set(game.projects.flatMap((project) => project.screenshots))].slice(
    0,
    SCREENSHOT_LIMIT,
  );
}

export function gameTopics(game: TrackedGame): string[] {
  return [...new Set(game.projects.flatMap((project) => project.topics))].slice(0, TOPIC_LIMIT);
}

interface ReleaseFeedEntry extends TrackedRelease {
  projectName: string;
}

export function gameReleaseFeed(game: TrackedGame): ReleaseFeedEntry[] {
  return game.projects
    .flatMap((project) =>
      project.recentReleases.map((release) => ({ ...release, projectName: project.projectName })),
    )
    .sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''))
    .slice(0, RELEASE_FEED_LIMIT);
}

// Steam-style feature bullets inferred from repository topics and the
// platforms the projects ship to.
export function gameFeatures(game: TrackedGame): string[] {
  const topics = new Set(
    game.projects.flatMap((project) => project.topics.map((topic) => topic.toLowerCase())),
  );
  const targetPlatforms = new Set(game.projects.flatMap((project) => project.targetPlatforms));
  const features: string[] = [];
  if (MULTIPLAYER_TOPICS.some((topic) => topics.has(topic))) features.push('Multiplayer');
  if ([...topics].some((topic) => /(^|[-_])mods?([-_]|$)/.test(topic))) {
    features.push('Mod support');
  }
  if (targetPlatforms.size >= 3) features.push('Cross-platform');
  return features;
}

interface StoreGamePageProps {
  game: TrackedGame;
  art: string[];
  watched: boolean;
  library: LibraryEntry[];
  onBack(): void;
  onToggleWatch(gameKey: string): void;
  onOpenInLibrary(gameId: string): void;
  // Real-download handlers wired by App; absent, Download falls back to
  // opening the project's release page.
  onDownloadProject?(project: TrackedProject): void;
  onDownloadAsset?(project: TrackedProject, asset: DownloadAsset): void;
  // Live mods for the game's store-linked projects; null/omitted hides the
  // Mods section. onOpenMods switches to the Mods tab.
  liveMods?: LiveMod[] | null;
  onOpenMods?(): void;
  // Catalog for "More like this"; omitted hides the section.
  allGames?: TrackedGame[];
  onOpenGame?(gameKey: string): void;
}

// Install state of a store-linked project, derived from the active library:
// queued/downloading entries read "Downloading…", installed or downloaded
// (finished transfer, setup pending) ones are honestly "In library".
export function projectInstallState(
  project: TrackedProject,
  library: LibraryEntry[],
): ProjectInstallState {
  // Keyed the same way downloads are: scanned projects have no gameId, and
  // bailing out on that made every one of them read "not in library" forever,
  // even straight after a download.
  const entry = library.find((item) => item.gameId === libraryGameId(project));
  if (!entry || entry.installState === 'available') return 'none';
  return entry.installState === 'installed' || entry.installState === 'downloaded'
    ? 'in-library'
    : 'downloading';
}

// Per-game page, laid out like a Steam app page: the title and subtitle lead
// above the content grid, the main column opens with the screenshot gallery
// followed by about text, tag chips, a recent-updates feed and every tracked
// implementation, and the right rail opens with the full-width portrait cover
// ahead of a compact metadata card.
export function StoreGamePage({
  game,
  art,
  watched,
  library,
  onBack,
  onToggleWatch,
  onOpenInLibrary,
  onDownloadProject,
  onDownloadAsset,
  liveMods = null,
  onOpenMods,
  allGames,
  onOpenGame,
}: StoreGamePageProps) {
  const allScreenshots = gameScreenshots(game);
  const [activeShot, setActiveShot] = useState(0);
  const [brokenShots, setBrokenShots] = useState<ReadonlySet<string>>(new Set());
  // Broken screenshot URLs drop out of the gallery entirely: the thumb leaves
  // the strip and the main preview settles on the next working shot.
  const screenshots = allScreenshots.filter((url) => !brokenShots.has(url));
  const markShotBroken = (url: string) =>
    setBrokenShots((broken) => (broken.has(url) ? broken : new Set(broken).add(url)));
  const topics = gameTopics(game);
  const features = gameFeatures(game);
  const releaseFeed = gameReleaseFeed(game);
  const coverAspect = gameCoverAspect(game);
  const targetPlatforms = [...new Set(game.projects.flatMap((p) => p.targetPlatforms))];
  const developmentSummary = [...new Set(game.projects.map((p) => p.developmentState))].join(' · ');
  const lastChecked = game.projects.reduce<string | null>(
    (latest, p) =>
      p.lastCheckedAt && (latest === null || p.lastCheckedAt > latest) ? p.lastCheckedAt : latest,
    null,
  );
  // The subtitle never echoes the H2: the full title appears only when it
  // differs from the short one shown above it.
  const subtitleParts = [
    ...(game.gameTitle !== game.gameShortTitle ? [game.gameTitle] : []),
    ...(game.originalReleaseYear > 0 ? [String(game.originalReleaseYear)] : []),
    ...game.originalPlatforms,
  ];
  const shownShot = Math.min(activeShot, Math.max(screenshots.length - 1, 0));

  // The CTA box at the top of the right rail mirrors Steam's purchase box:
  // it anchors on the store-linked project, else the first implementation
  // that actually has something to download — a source-only decomp listed
  // first must not hide a sibling port's real release.
  // The implementation with the best download for THIS machine leads, not
  // whichever one happens to be listed first. Mario Kart 64 has three
  // projects: one ships a Windows-only zip, another a native AppImage —
  // first-wins offered the Windows build and made the player run it in Wine
  // for no reason.
  const bestOffer = bestAssetFor(game.projects.map((project) => project.downloadAssets));
  const ctaProject =
    (bestOffer ? game.projects[bestOffer.index] : null) ??
    game.projects.find((project) => project.gameId) ??
    game.projects.find(
      (project) => project.downloadAssets.length > 0 || projectDownloadUrl(project) !== null,
    ) ??
    game.projects[0] ??
    null;
  const ctaState = ctaProject ? projectInstallState(ctaProject, library) : 'none';
  const ctaHasAction =
    ctaProject !== null &&
    (ctaProject.downloadAssets.length > 0 || projectDownloadUrl(ctaProject) !== null);
  const ctaSourceUrl = ctaProject ? sourceArchiveUrl(ctaProject) : null;

  // Store-linked games surface their community mods right on the page.
  const storeGameIds = new Set(
    game.projects.map((project) => project.gameId).filter((id): id is string => id !== null),
  );
  const gameMods = (liveMods ?? []).filter((mod) => storeGameIds.has(mod.gameId));

  // Steam's "More like this": franchise members first (shared leading title
  // word), then platform and era neighbors. Real catalog data only.
  const leadWord = game.gameShortTitle.split(/\s+/)[0]?.toLowerCase() ?? '';
  const related = (allGames ?? [])
    .filter((other) => other.gameKey !== game.gameKey)
    .map((other) => {
      let score = 0;
      if (leadWord.length >= 3 && other.gameShortTitle.toLowerCase().startsWith(leadWord)) {
        score += 3;
      }
      score += other.originalPlatforms.filter((platform) =>
        game.originalPlatforms.includes(platform),
      ).length * 2;
      if (
        game.originalReleaseYear > 0 &&
        other.originalReleaseYear > 0 &&
        Math.abs(game.originalReleaseYear - other.originalReleaseYear) <= 3
      ) {
        score += 1;
      }
      return [other, score] as const;
    })
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([other]) => other);

  return (
    <section className="store-view game-page" aria-labelledby="game-page-title">
      <nav aria-label="Breadcrumb" className="game-page-crumbs">
        <button className="game-page-back" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={13} />
          Store
        </button>
        {game.originalPlatforms[0] ? (
          <>
            <span aria-hidden="true">›</span>
            <span>{game.originalPlatforms[0]}</span>
          </>
        ) : null}
        <span aria-hidden="true">›</span>
        <span aria-current="page">{game.gameShortTitle}</span>
      </nav>

      <header className="game-page-heading">
        <h2 id="game-page-title">{game.gameShortTitle}</h2>
        <p className="game-page-subtitle">{subtitleParts.join(' · ')}</p>
        <div className="game-page-actions">
          <span className="tracking-badge" data-availability={game.availability}>
            {AVAILABILITY_LABELS[game.availability]}
          </span>
        </div>
      </header>

      <div className="game-page-layout">
        <div className="game-page-main">
          {screenshots.length > 0 ? (
            <section aria-labelledby="game-page-shots-heading" className="game-page-shots">
              <h3 id="game-page-shots-heading">Screenshots</h3>
              <div className="game-page-shot-main">
                <img
                  alt={`${game.gameShortTitle} screenshot ${shownShot + 1}`}
                  key={screenshots[shownShot]}
                  src={screenshots[shownShot]}
                  onError={() => markShotBroken(screenshots[shownShot])}
                  onLoad={markLowResShot}
                />
              </div>
              {screenshots.length > 1 ? (
                <div className="game-page-shot-thumbs" role="list">
                  {screenshots.map((shot, index) => (
                    <button
                      aria-current={index === shownShot}
                      aria-label={`Show screenshot ${index + 1}`}
                      className="game-page-shot-thumb"
                      key={shot}
                      type="button"
                      onClick={() => setActiveShot(index)}
                    >
                      <img
                        alt=""
                        loading="lazy"
                        src={shot}
                        onError={() => markShotBroken(shot)}
                        onLoad={markLowResShot}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="game-page-impls-heading" className="game-page-impls">
            <h3 id="game-page-impls-heading">Implementations</h3>
            {game.projects.map((project) => {
              const installState = projectInstallState(project, library);
              const downloadPage = projectDownloadUrl(project);
              const isConsumerPort = CONSUMER_PORT_TYPES.includes(project.projectType);
              const sourceZip = sourceArchiveUrl(project);
              const hasPackaged = project.downloadAssets.length > 0 || downloadPage !== null;
              return (
                <article className="game-impl" key={project.id}>
                  <div className="game-impl-main">
                    <h4>
                      {project.projectName}
                      <a
                        aria-label={`Open the ${project.projectName} repository`}
                        className="game-impl-repo-link"
                        href={project.repositoryUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink aria-hidden="true" size={11} />
                        {project.repositoryUrl.includes('gitlab.com') ? 'GitLab' : 'GitHub'}
                      </a>
                    </h4>
                    <p>
                      {PROJECT_TYPE_LABELS[project.projectType]} · {project.developmentState}
                      {project.stability !== 'unknown' ? ` · ${project.stability}` : ''} ·{' '}
                      {project.completionLabel}
                    </p>
                    {project.description && project.description !== game.description ? (
                      <p className="game-impl-description">{project.description}</p>
                    ) : null}
                    <p className="game-impl-sub">
                      {project.targetPlatforms.length > 0
                        ? project.targetPlatforms.join(', ')
                        : 'No target platforms listed'}{' '}
                      · {project.latestVersion ?? 'No releases'} · Last activity{' '}
                      {project.lastActivityAt ? formatDate(project.lastActivityAt) : 'unknown'}
                    </p>
                    <details className="game-impl-setup">
                      <summary>Setup guide</summary>
                      <ol>
                        {setupSteps(project, hasPackaged).map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </details>
                  </div>
                  {installState === 'in-library' && project.gameId !== null ? (
                    <InLibraryButton
                      gameId={project.gameId}
                      gameName={game.gameShortTitle}
                      onOpenInLibrary={onOpenInLibrary}
                    />
                  ) : installState === 'none' &&
                    project.downloadAssets.length === 0 &&
                    !downloadPage ? (
                    <div className="game-impl-source">
                      {sourceZip ? (
                        <a
                          className="game-impl-source-link"
                          href={sourceZip}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Source (.zip)
                        </a>
                      ) : null}
                      <span className="tracking-source-note">
                        {isConsumerPort ? 'No releases yet' : 'Source only'}
                      </span>
                    </div>
                  ) : (
                    <ProjectDownloadControl
                      installState={installState}
                      project={project}
                      realDownloads={onDownloadProject !== undefined}
                      onDownloadAsset={onDownloadAsset}
                      onDownloadProject={onDownloadProject}
                    />
                  )}
                </article>
              );
            })}
          </section>

          {game.description ? (
            <section aria-labelledby="game-page-about-heading" className="game-page-about">
              <h3 id="game-page-about-heading">About</h3>
              <p>{game.description}</p>
            </section>
          ) : null}

          {releaseFeed.length > 0 ? (
            <section aria-labelledby="game-page-updates-heading" className="game-page-updates">
              <h3 id="game-page-updates-heading">Recent updates</h3>
              <ul>
                {releaseFeed.map((release) => (
                  <li key={`${release.projectName}-${release.version}-${release.url}`}>
                    <a href={release.url} rel="noreferrer" target="_blank">
                      {release.version}
                    </a>
                    <span className="update-project">{release.projectName}</span>
                    <span className="update-date">
                      {release.publishedAt ? formatDate(release.publishedAt) : 'Date unknown'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {storeGameIds.size > 0 && gameMods.length > 0 ? (
            <section aria-labelledby="game-page-mods-heading" className="game-page-mods">
              <h3 id="game-page-mods-heading">Mods</h3>
              <div className="mods-grid">
                {gameMods.slice(0, 3).map((mod) => (
                  <LiveModCard key={mod.id} mod={mod} />
                ))}
              </div>
              {onOpenMods ? (
                <button
                  className="link-button game-page-mods-all"
                  type="button"
                  onClick={onOpenMods}
                >
                  See all in Mods
                </button>
              ) : null}
            </section>
          ) : null}

          {related.length > 0 && onOpenGame ? (
            <section aria-labelledby="game-page-related-heading" className="game-page-related">
              <h3 id="game-page-related-heading">More like this</h3>
              <div className="related-grid">
                {related.map((other) => (
                  <button
                    key={other.gameKey}
                    type="button"
                    onClick={() => onOpenGame(other.gameKey)}
                  >
                    <span
                      className="related-art"
                      style={{ background: capsuleGradient(other.gameShortTitle) }}
                    >
                      {other.coverUrl ? (
                        <img alt="" loading="lazy" src={other.coverUrl} onError={hideBrokenImage} />
                      ) : (
                        <span aria-hidden="true">{titleInitials(other.gameShortTitle)}</span>
                      )}
                    </span>
                    <span className="related-title">{other.gameShortTitle}</span>
                    <span className="related-state">{AVAILABILITY_LABELS[other.availability]}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside aria-label="Game details" className="game-page-meta">
          <div className="game-cta-box">
            <p className="game-cta-heading">
              {ctaState === 'in-library'
                ? `${game.gameShortTitle} is in your library`
                : ctaState === 'downloading'
                  ? `Downloading ${game.gameShortTitle}…`
                  : `Get ${game.gameShortTitle}`}
            </p>
            {ctaProject && ctaState === 'in-library' && ctaProject.gameId !== null ? (
              <InLibraryButton
                gameId={ctaProject.gameId}
                gameName={game.gameShortTitle}
                onOpenInLibrary={onOpenInLibrary}
              />
            ) : ctaProject && ctaHasAction ? (
              <ProjectDownloadControl
                installState={ctaState}
                primaryClassName="game-cta-download"
                project={ctaProject}
                realDownloads={onDownloadProject !== undefined}
                onDownloadAsset={onDownloadAsset}
                onDownloadProject={onDownloadProject}
              />
            ) : ctaSourceUrl ? (
              <>
                <a
                  className="game-cta-download game-cta-source"
                  href={ctaSourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Download source (.zip)
                </a>
                <p className="game-cta-fallback">
                  No packaged release yet — build it with the setup guide under Implementations.
                </p>
              </>
            ) : (
              <p className="game-cta-fallback">
                No downloadable release yet — track it to follow updates.
              </p>
            )}
            <button
              aria-label={`Track ${game.gameShortTitle}`}
              aria-pressed={watched}
              className="watch-toggle game-cta-wishlist"
              type="button"
              onClick={() => onToggleWatch(game.gameKey)}
            >
              <Heart aria-hidden="true" size={13} />
              {watched ? 'Tracked' : 'Track game'}
            </button>
          </div>
          <div
            className="game-page-cover"
            style={{
              background: capsuleGradient(game.gameShortTitle),
              // Off-portrait box art keeps its honest ratio in the rail
              // instead of floating in a blur-filled 2:3 slot.
              aspectRatio:
                coverAspect !== null && coverAspect > 0.85 ? String(coverAspect) : undefined,
            }}
          >
            <ArtImage candidates={art} coverAspect={coverAspect} />
            {art.length > 0 ? null : (
              <span className="game-page-cover-fallback">{game.gameShortTitle}</span>
            )}
          </div>
          {game.description ? <p className="game-page-glance-desc">{game.description}</p> : null}
          {topics.length > 0 ? (
            <div className="game-page-glance-tags">
              <span className="glance-tags-label">Popular tags</span>
              <ul>
                {topics.map((topic) => (
                  <li className="topic-chip" key={topic}>
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {features.length > 0 ? (
            <ul className="game-page-features">
              {features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          ) : null}
          <dl>
            {game.originalReleaseYear > 0 ? (
              <div>
                <dt>Release year</dt>
                <dd>{game.originalReleaseYear}</dd>
              </div>
            ) : null}
            <div>
              <dt>Original platforms</dt>
              <dd>{game.originalPlatforms.join(', ')}</dd>
            </div>
            {targetPlatforms.length > 0 ? (
              <div>
                <dt>Target platforms</dt>
                <dd>{targetPlatforms.join(', ')}</dd>
              </div>
            ) : null}
            {developmentSummary !== 'unknown' ? (
              <div>
                <dt>Development</dt>
                <dd className="game-page-meta-states">{developmentSummary}</dd>
              </div>
            ) : null}
            <div>
              <dt>Latest activity</dt>
              <dd>{game.latestActivityAt ? formatDate(game.latestActivityAt) : 'Unknown'}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{lastChecked ? formatDate(lastChecked) : 'Not checked yet'}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
