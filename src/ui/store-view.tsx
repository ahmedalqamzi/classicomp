import { ChevronDown, ChevronRight, Heart, Search } from 'lucide-react';
import { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';
import {
  AVAILABILITY_LABELS,
  EMPTY_TRACKING_FILTERS,
  PROJECT_TYPE_LABELS,
  filterTrackedGames,
  groupTrackedProjects,
  isStorefrontReady,
  libraryGameId,
  projectDownloadUrl,
} from '../domain/tracking';
import type { TrackedAvailability, TrackedGame, TrackingFilters } from '../domain/tracking';
import type { DownloadAsset, Game, LibraryEntry, LiveMod, TrackedProject } from '../domain/types';
import { ProjectDownloadControl } from './download-control';
import { useMenuFocus } from './keyboard-accessibility';
import {
  ArtImage,
  CONSUMER_PORT_TYPES,
  CapsuleThumb,
  InLibraryButton,
  StoreGamePage,
  browseArtCandidates,
  capsuleGradient,
  gameCoverAspect,
  gameScreenshots,
  projectInstallState,
  storeArtCandidates,
} from './store-game-page';

// Store shelves lead with box art. Screenshots would slot into one landscape
// format more easily, but the box is what identifies a retro game at a
// glance and it is what this store is a catalogue of; screenshots stay the
// fallback for the handful of games with no cover at all. The incompatible
// shapes of retro scans are handled by the capsule's square tile, which is
// the centre of this catalogue's aspect distribution — see .store-capsule-art.
function storeCapsuleArtCandidates(
  game: TrackedGame,
  localArt: ReadonlyMap<string, string>,
): string[] {
  return [...new Set([...storeArtCandidates(game, localArt), ...gameScreenshots(game)])];
}

interface StoreViewProps {
  projects: TrackedProject[];
  library: LibraryEntry[];
  watchedGameKeys: ReadonlySet<string>;
  lastScanAt: string | null;
  games?: Game[];
  // The store auto-updates; App still passes a refresh callback, which the
  // view intentionally ignores.
  onRefresh?(): Promise<void>;
  // Surfaces a failed background scan in the scanline when App provides one.
  scanError?: string | null;
  // Real-download handlers wired by App. When onDownloadProject is absent,
  // every Download button degrades to opening the project's release page.
  onDownloadProject?(project: TrackedProject): void;
  onDownloadAsset?(project: TrackedProject, asset: DownloadAsset): void;
  onToggleWatch(gameKey: string): void;
  onOpenInLibrary(gameId: string): void;
  onInstall(gameId: string): void;
  // A header notice can deep-link straight to a game's page.
  focusGameKey?: string | null;
  onFocusGameHandled?(): void;
  // Bumped by App when the Store tab is clicked while already on the store:
  // close any open game page and land the storefront at the top.
  homeNonce?: number;
  // User-initiated page opens/closes, for App's navigation history.
  onNavigate?(gameKey: string | null): void;
  // Live mods and a Mods-tab opener, passed through to game pages.
  liveMods?: LiveMod[] | null;
  onOpenMods?(): void;
}

// The browse pool is already storefront-filtered, so only the two playable
// tiers remain meaningful as a filter.
const AVAILABILITY_OPTIONS: TrackedAvailability[] = ['released', 'playable'];

const SHELF_LIMIT = 12;
const FEATURED_SHOT_LIMIT = 4;
const SEARCH_DEBOUNCE_MS = 150;

// The bulk "Catalogued; verification queued" placeholder is noise when it
// repeats on dozens of rows; those rows read as an em-dash instead.
const PLACEHOLDER_COMPLETION_LABEL = 'Catalogued; verification queued';

// The store splits into Steam-style sections: the featured front page,
// the filterable browse catalog, and the wishlist.
type StorePage = 'home' | 'browse' | 'wishlist';

// Session-only memory of where the store was when the user tabbed away:
// the open game page, section, and the browse scroll position. Keyed by the
// projects array identity, so any real state change (new scan, another
// profile, a fresh session) invalidates it instead of restoring a stale view.
let rememberedStore: {
  projects: TrackedProject[];
  gameKey: string | null;
  page: StorePage;
  scrollTop: number;
  browse: { queryInput: string; filters: TrackingFilters };
} | null = null;

const EMPTY_BROWSE_STATE = { queryInput: '', filters: EMPTY_TRACKING_FILTERS };

function formatScanTime(scanAt: string): string {
  const parsed = new Date(scanAt);
  if (Number.isNaN(parsed.getTime())) return scanAt;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function StoreView({
  projects,
  library,
  watchedGameKeys,
  lastScanAt,
  games = [],
  scanError = null,
  onDownloadProject,
  onDownloadAsset,
  onToggleWatch,
  onOpenInLibrary,
  liveMods = null,
  onOpenMods,
  focusGameKey = null,
  onFocusGameHandled,
  homeNonce = 0,
  onNavigate,
}: StoreViewProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [openGameKey, setOpenGameKey] = useState<string | null>(() =>
    rememberedStore && rememberedStore.projects === projects ? rememberedStore.gameKey : null,
  );
  const [page, setPage] = useState<StorePage>(() =>
    rememberedStore && rememberedStore.projects === projects ? rememberedStore.page : 'home',
  );
  // Bumped when a category pick or nav search seeds fresh browse state; the
  // key remounts StoreBrowse so it re-reads initialBrowse.
  const [browseSeed, setBrowseSeed] = useState(0);
  const browseScrollTop = useRef(
    rememberedStore && rememberedStore.projects === projects ? rememberedStore.scrollTop : 0,
  );
  // Query and filters survive tab switches and game-page round-trips, so a
  // restored scroll position always lands on the list it was measured in.
  const browseStateRef = useRef(
    rememberedStore && rememberedStore.projects === projects
      ? rememberedStore.browse
      : EMPTY_BROWSE_STATE,
  );
  const previousScanAt = useRef(lastScanAt);
  const [scanAnnouncement, setScanAnnouncement] = useState(scanError ?? '');

  useEffect(() => {
    if (scanError) setScanAnnouncement(scanError);
    else if (lastScanAt && lastScanAt !== previousScanAt.current) {
      setScanAnnouncement('Catalog updated');
    }
    previousScanAt.current = lastScanAt;
  }, [lastScanAt, scanError]);
  const needsScrollRestore = useRef(openGameKey === null && browseScrollTop.current > 0);
  useEffect(() => {
    if (!focusGameKey) return;
    setOpenGameKey(focusGameKey);
    onFocusGameHandled?.();
  }, [focusGameKey, onFocusGameHandled]);

  // The storefront sells playable games only; source-only and in-development
  // projects stay tracked in the background and appear once a build ships.
  const allTracked = useMemo(() => groupTrackedProjects(projects), [projects]);
  const storeGames = useMemo(() => allTracked.filter(isStorefrontReady), [allTracked]);
  const libraryGameIds = useMemo(
    () => new Set(library.map((entry) => entry.gameId)),
    [library],
  );

  // Consume the session memory once mounted; the unmount cleanup below
  // re-arms it. (State initializers only read it, so StrictMode's double
  // invocation stays safe.)
  useEffect(() => {
    if (rememberedStore && rememberedStore.projects === projects) rememberedStore = null;
  });

  useEffect(() => {
    return () => {
      rememberedStore = {
        projects,
        gameKey: openGameKey,
        page,
        scrollTop:
          openGameKey === null
            ? (rootRef.current?.scrollTop ?? browseScrollTop.current)
            : browseScrollTop.current,
        browse: browseStateRef.current,
      };
    };
  }, [projects, openGameKey, page]);

  // Steam's "go home": clicking the Store tab while already on the store
  // closes any open game page and lands the storefront at the top.
  const previousHomeNonce = useRef(homeNonce);
  useEffect(() => {
    if (homeNonce === previousHomeNonce.current) return;
    previousHomeNonce.current = homeNonce;
    browseScrollTop.current = 0;
    needsScrollRestore.current = true;
    setOpenGameKey(null);
    setPage('home');
    if (rootRef.current) rootRef.current.scrollTop = 0;
  }, [homeNonce]);

  // Restore the browse scroll after a tab-away restore and after Back.
  useEffect(() => {
    if (openGameKey !== null || !needsScrollRestore.current || !rootRef.current) return;
    needsScrollRestore.current = false;
    rootRef.current.scrollTop = browseScrollTop.current;
  }, [openGameKey]);

  function openGamePage(gameKey: string) {
    browseScrollTop.current = rootRef.current?.scrollTop ?? 0;
    setOpenGameKey(gameKey);
    onNavigate?.(gameKey);
  }

  function closeGamePage() {
    needsScrollRestore.current = true;
    setOpenGameKey(null);
    onNavigate?.(null);
  }

  function goPage(next: StorePage) {
    setPage(next);
    if (rootRef.current) rootRef.current.scrollTop = 0;
  }

  // Opens Browse, optionally seeded with a category or a search term from
  // the store nav; seeding remounts StoreBrowse so it picks the state up.
  function openBrowse(platform: string | null = null, query = '') {
    if (platform !== null || query !== '') {
      browseStateRef.current = {
        queryInput: query,
        filters: { ...EMPTY_TRACKING_FILTERS, platform, query },
      };
      setBrowseSeed((seed) => seed + 1);
    }
    goPage('browse');
  }

  // Built-in games keep local artwork. Everything else falls back to pulled
  // box art, then the GitHub OpenGraph card, then the generated gradient.
  const artByGameId = useMemo(() => {
    const art = new Map<string, string>();
    for (const game of games) {
      const url = game.artworkUrl ?? game.iconUrl;
      if (url) art.set(game.id, url);
    }
    return art;
  }, [games]);

  // Play state mirrors Steam: owned games read "In library", everything else
  // reads its availability.
  function isOwned(game: TrackedGame): boolean {
    return game.projects.some(
      (project) => project.gameId !== null && libraryGameIds.has(project.gameId),
    );
  }

  function playStateLabel(game: TrackedGame): string {
    return isOwned(game) ? 'In library' : AVAILABILITY_LABELS[game.availability];
  }

  // The featured slot rotates daily through the released store-linked games.
  const featuredPool = useMemo(
    () =>
      storeGames.filter((game) =>
        game.projects.some((project) => project.gameId && artByGameId.has(project.gameId)),
      ),
    [storeGames, artByGameId],
  );
  const featured =
    featuredPool.length > 0
      ? featuredPool[Math.floor(Date.now() / 86_400_000) % featuredPool.length]
      : null;

  const shelves = useMemo(() => {
    // Steam's front page ranks by recency, not the alphabet: the lead shelf
    // is real published releases newest-first, and "Released & playable"
    // orders by latest activity instead of being a permanent A–L window.
    const latestReleaseAt = (game: TrackedGame): string | null => {
      let latest: string | null = null;
      for (const project of game.projects) {
        for (const release of project.recentReleases) {
          if (release.publishedAt && (!latest || release.publishedAt > latest)) {
            latest = release.publishedAt;
          }
        }
      }
      return latest;
    };
    const newReleases = storeGames
      .map((game) => [game, latestReleaseAt(game)] as const)
      .filter((entry): entry is [TrackedGame, string] => entry[1] !== null)
      .sort((left, right) => right[1].localeCompare(left[1]))
      .map(([game]) => game)
      .slice(0, SHELF_LIMIT);
    const recentlyUpdated = [...storeGames]
      .filter((game) => game.latestActivityAt !== null)
      .sort((left, right) =>
        (right.latestActivityAt ?? '').localeCompare(left.latestActivityAt ?? ''),
      )
      .slice(0, SHELF_LIMIT);
    const wishlisted = storeGames
      .filter((game) => watchedGameKeys.has(game.gameKey))
      .slice(0, SHELF_LIMIT);
    return [
      { title: 'New releases', games: newReleases },
      { title: 'Recently updated', games: recentlyUpdated },
      { title: 'On your tracker', games: wishlisted },
    ];
  }, [storeGames, watchedGameKeys]);

  // Category chips in the store nav: original platforms ranked by how many
  // storefront games they hold.
  const categoryPlatforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const game of storeGames) {
      for (const platform of game.originalPlatforms) {
        counts.set(platform, (counts.get(platform) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10);
  }, [storeGames]);

  const wishlistGames = useMemo(
    () => storeGames.filter((game) => watchedGameKeys.has(game.gameKey)),
    [storeGames, watchedGameKeys],
  );

  // Capsule and browse-row clicks open the game's own page inside the store.
  const openGame =
    openGameKey === null
      ? null
      : (storeGames.find((game) => game.gameKey === openGameKey) ?? null);

  if (openGame) {
    return (
      <StoreGamePage
        allGames={storeGames}
        art={storeArtCandidates(openGame, artByGameId)}
        game={openGame}
        library={library}
        liveMods={liveMods}
        watched={watchedGameKeys.has(openGame.gameKey)}
        onBack={closeGamePage}
        onOpenGame={openGamePage}
        onDownloadAsset={onDownloadAsset}
        onDownloadProject={onDownloadProject}
        onOpenInLibrary={onOpenInLibrary}
        onOpenMods={onOpenMods}
        onToggleWatch={onToggleWatch}
      />
    );
  }

  return (
    <section className="store-view" aria-labelledby="store-heading" ref={rootRef}>
      <div className="store-topline">
        <h2 className="store-title" id="store-heading">
          Store
        </h2>
        <div className="store-scanline">
          <span>
            {scanError ??
              (lastScanAt
                ? `Auto-updating · Last scan ${formatScanTime(lastScanAt)} · ${storeGames.length} playable games · ${allTracked.length - storeGames.length} more in development`
                : 'First scan pending…')}
          </span>
          <span
            aria-atomic="true"
            aria-live="polite"
            className="visually-hidden"
            role="status"
          >
            {scanAnnouncement}
          </span>
        </div>
      </div>

      <StoreNav
        activePage={page}
        platforms={categoryPlatforms}
        wishlistCount={watchedGameKeys.size}
        onGoHome={() => goPage('home')}
        onGoBrowse={() => openBrowse()}
        onGoWishlist={() => goPage('wishlist')}
        onPickCategory={(platform) => openBrowse(platform)}
        onSearch={(query) => openBrowse(null, query)}
      />

      {page === 'home' ? (
        <>
          {featured ? (
            <FeaturedCapsule
              art={storeArtCandidates(featured, artByGameId)}
              game={featured}
              library={library}
              playState={playStateLabel(featured)}
              realDownloads={onDownloadProject !== undefined}
              onDownloadAsset={onDownloadAsset}
              onDownloadProject={onDownloadProject}
              onOpen={openGamePage}
              onOpenInLibrary={onOpenInLibrary}
            />
          ) : null}

          {shelves.map((shelf) =>
            shelf.games.length > 0 ? (
              <StoreShelf key={shelf.title} title={shelf.title}>
                {shelf.games.map((game) => (
                  <StoreCapsule
                    art={storeCapsuleArtCandidates(game, artByGameId)}
                    coverAspect={gameCoverAspect(game)}
                    game={game}
                    key={game.gameKey}
                    playState={playStateLabel(game)}
                    onOpen={openGamePage}
                  />
                ))}
              </StoreShelf>
            ) : null,
          )}

          <div className="store-home-foot">
            <button className="store-browse-all" type="button" onClick={() => openBrowse()}>
              Browse all {storeGames.length} games
              <ChevronRight aria-hidden="true" size={14} />
            </button>
          </div>
        </>
      ) : null}

      {page === 'browse' ? (
        <StoreBrowse
          artByGameId={artByGameId}
          initialBrowse={browseStateRef.current}
          key={browseSeed}
          library={library}
          storeGames={storeGames}
          watchedGameKeys={watchedGameKeys}
          onBrowseChange={(queryInput, filters) => {
            browseStateRef.current = { queryInput, filters };
          }}
          onDownloadAsset={onDownloadAsset}
          onDownloadProject={onDownloadProject}
          onOpen={openGamePage}
          onOpenInLibrary={onOpenInLibrary}
          onToggleWatch={onToggleWatch}
        />
      ) : null}

      {page === 'wishlist' ? (
        <section aria-labelledby="store-wishlist-heading" className="store-wishlist">
          <h3 className="store-section-title" id="store-wishlist-heading">
            Your tracker
          </h3>
          {wishlistGames.length === 0 ? (
            <p className="empty-state">
              Your tracker is empty — track a game to follow its releases.
            </p>
          ) : (
            <div className="wishlist-grid">
              {wishlistGames.map((game) => (
                <StoreCapsule
                  art={storeCapsuleArtCandidates(game, artByGameId)}
                  coverAspect={gameCoverAspect(game)}
                  game={game}
                  key={game.gameKey}
                  playState={playStateLabel(game)}
                  onOpen={openGamePage}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

interface StoreNavProps {
  activePage: StorePage;
  platforms: [string, number][];
  wishlistCount: number;
  onGoHome(): void;
  onGoBrowse(): void;
  onGoWishlist(): void;
  onPickCategory(platform: string): void;
  onSearch(query: string): void;
}

// Steam's store sub-navigation: section tabs and a categories menu on the
// left, catalog search and the wishlist on the right.
function StoreNav({
  activePage,
  platforms,
  wishlistCount,
  onGoHome,
  onGoBrowse,
  onGoWishlist,
  onPickCategory,
  onSearch,
}: StoreNavProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { closeAndRestore, menuRef, onMenuKeyDown } = useMenuFocus<HTMLDivElement>(
    categoriesOpen,
    () => setCategoriesOpen(false),
    { returnFocusTo: toggleRef.current },
  );

  useEffect(() => {
    if (!categoriesOpen) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setCategoriesOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [categoriesOpen]);

  return (
    <nav aria-label="Store sections" className="store-nav">
      <button
        aria-current={activePage === 'home' ? 'page' : undefined}
        className="store-nav-tab"
        type="button"
        onClick={onGoHome}
      >
        Featured
      </button>
      <button
        aria-current={activePage === 'browse' ? 'page' : undefined}
        className="store-nav-tab"
        type="button"
        onClick={onGoBrowse}
      >
        Browse
      </button>
      <div className="store-nav-categories" ref={wrapRef}>
        <button
          aria-expanded={categoriesOpen}
          aria-haspopup="menu"
          className="store-nav-tab"
          ref={toggleRef}
          type="button"
          onClick={() => setCategoriesOpen((open) => !open)}
        >
          Categories
          <ChevronDown aria-hidden="true" size={12} />
        </button>
        {categoriesOpen ? (
          <div className="store-nav-menu" ref={menuRef} role="menu" onKeyDown={onMenuKeyDown}>
            {platforms.map(([platform, count]) => (
              <button
                key={platform}
                role="menuitem"
                type="button"
                onClick={() => {
                  closeAndRestore();
                  onPickCategory(platform);
                }}
              >
                {platform}
                <span className="store-nav-menu-count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <form
        className="store-nav-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim() === '') return;
          onSearch(query.trim());
          setQuery('');
        }}
      >
        <Search aria-hidden="true" size={12} />
        <input
          aria-label="Search the catalog"
          placeholder="Search games"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <button
        aria-current={activePage === 'wishlist' ? 'page' : undefined}
        aria-label={`Open tracker, ${wishlistCount} ${wishlistCount === 1 ? 'game' : 'games'}`}
        className="store-nav-wishlist"
        type="button"
        onClick={onGoWishlist}
      >
        <Heart aria-hidden="true" size={13} />
        Tracker
        {wishlistCount > 0 ? (
          <span aria-hidden="true" className="store-nav-badge">
            {wishlistCount}
          </span>
        ) : null}
      </button>
    </nav>
  );
}

interface StoreBrowseProps {
  storeGames: TrackedGame[];
  library: LibraryEntry[];
  watchedGameKeys: ReadonlySet<string>;
  artByGameId: ReadonlyMap<string, string>;
  onOpen(gameKey: string): void;
  onToggleWatch(gameKey: string): void;
  onOpenInLibrary(gameId: string): void;
  onDownloadProject?(project: TrackedProject): void;
  onDownloadAsset?(project: TrackedProject, asset: DownloadAsset): void;
  // Seed + report browse state so it survives tab switches and game pages.
  initialBrowse?: { queryInput: string; filters: TrackingFilters };
  onBrowseChange?(queryInput: string, filters: TrackingFilters): void;
}

// The browse-all list owns the filter state, so typing in the search box
// re-renders only this subtree — the featured hero and shelves above it are
// untouched. The query itself is debounced ~150ms so a keystroke burst costs
// one filter pass, not one per character.
function StoreBrowse({
  storeGames,
  library,
  watchedGameKeys,
  artByGameId,
  onOpen,
  onToggleWatch,
  onOpenInLibrary,
  onDownloadProject,
  onDownloadAsset,
  initialBrowse,
  onBrowseChange,
}: StoreBrowseProps) {
  const [queryInput, setQueryInput] = useState(initialBrowse?.queryInput ?? '');
  const [filters, setFilters] = useState<TrackingFilters>(
    initialBrowse?.filters ?? EMPTY_TRACKING_FILTERS,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.query === queryInput ? current : { ...current, query: queryInput },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    onBrowseChange?.(queryInput, filters);
  }, [queryInput, filters, onBrowseChange]);

  // Top original platforms become browse chips — the catalog's strongest
  // real browsing axis (topics only arrive via live scans).
  const platformChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const game of storeGames) {
      for (const platform of game.originalPlatforms) {
        counts.set(platform, (counts.get(platform) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);
  }, [storeGames]);

  const libraryGameIds = useMemo(
    () => new Set(library.map((entry) => entry.gameId)),
    [library],
  );
  const visibleGames = useMemo(
    () => filterTrackedGames(storeGames, filters, new Set(watchedGameKeys)),
    [storeGames, filters, watchedGameKeys],
  );
  const preferredBrowseGameKey =
    visibleGames.find((game) =>
      onDownloadProject && game.projects.some((project) => project.downloadAssets.length > 0),
    )?.gameKey ?? visibleGames[0]?.gameKey ?? null;
  const [activeBrowseGameKey, setActiveBrowseGameKey] = useState<string | null>(
    preferredBrowseGameKey,
  );

  useEffect(() => {
    if (!visibleGames.some((game) => game.gameKey === activeBrowseGameKey)) {
      setActiveBrowseGameKey(preferredBrowseGameKey);
    }
  }, [activeBrowseGameKey, preferredBrowseGameKey, visibleGames]);

  function onBrowseKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const currentGroup = (event.target as HTMLElement).closest<HTMLElement>('.tracking-game');
    const root = event.currentTarget;
    if (!currentGroup) return;
    const groups = [...root.querySelectorAll<HTMLElement>('.tracking-game')];
    const groupIndex = groups.indexOf(currentGroup);
    if (groupIndex < 0 || groups.length < 2) return;
    event.preventDefault();
    const controls = [
      ...currentGroup.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
    ];
    const controlIndex = Math.max(0, controls.indexOf(event.target as HTMLElement));
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextGroup = groups[(groupIndex + offset + groups.length) % groups.length];
    const nextControls = [
      ...nextGroup.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
    ];
    setActiveBrowseGameKey(nextGroup.dataset.gameKey ?? null);
    (nextControls[Math.min(controlIndex, nextControls.length - 1)] ?? nextGroup).focus();
  }

  function isOwned(game: TrackedGame): boolean {
    return game.projects.some(
      (project) => project.gameId !== null && libraryGameIds.has(project.gameId),
    );
  }

  function playStateLabel(game: TrackedGame): string {
    return isOwned(game) ? 'In library' : AVAILABILITY_LABELS[game.availability];
  }

  function clearFilters() {
    setQueryInput('');
    setFilters(EMPTY_TRACKING_FILTERS);
  }

  return (
    <div className="store-browse">
      <div className="store-browse-head">
        <h3>{filters.watchedOnly ? 'Your tracker' : 'Browse all'}</h3>
        <span className="store-count">
          {visibleGames.length} of {storeGames.length} games
        </span>
      </div>

      <div className="catalog-filters">
        <label className="search-field catalog-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="Search store"
            placeholder="Search store"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={filters.availability}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              availability: event.target.value as TrackingFilters['availability'],
            }))
          }
        >
          <option value="all">All statuses</option>
          {AVAILABILITY_OPTIONS.map((availability) => (
            <option key={availability} value={availability}>
              {AVAILABILITY_LABELS[availability]}
            </option>
          ))}
        </select>
        <button
          aria-pressed={filters.watchedOnly}
          className="tag-chip"
          type="button"
          onClick={() =>
            setFilters((current) => ({ ...current, watchedOnly: !current.watchedOnly }))
          }
        >
          Tracker ({watchedGameKeys.size})
        </button>
      </div>

      {platformChips.length > 1 ? (
        <div aria-label="Filter by platform" className="platform-chips" role="group">
          {platformChips.map(([platform, count]) => (
            <button
              aria-pressed={filters.platform === platform}
              className="tag-chip"
              key={platform}
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  platform: current.platform === platform ? null : platform,
                }))
              }
            >
              {platform} ({count})
            </button>
          ))}
        </div>
      ) : null}

      {visibleGames.length === 0 ? (
        filters.watchedOnly && watchedGameKeys.size === 0 ? (
          <p className="empty-state">
            Your tracker is empty — track a game to follow its releases.
          </p>
        ) : (
          <p className="empty-state">
            No games match these filters.{' '}
            <button className="link-button" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        )
      ) : (
        <div className="store-browse-results" onKeyDown={onBrowseKeyDown}>
        {visibleGames.map((game) => {
          const watched = watchedGameKeys.has(game.gameKey);
          const art = browseArtCandidates(game, artByGameId);
          const owned = isOwned(game);
          const browseTabIndex = activeBrowseGameKey === game.gameKey ? 0 : -1;
          return (
            <section
              aria-labelledby={`store-${game.gameKey}`}
              className="tracking-game"
              data-game-key={game.gameKey}
              id={`store-game-${game.gameKey}`}
              key={game.gameKey}
            >
              <div className="tracking-game-head">
                <h3 id={`store-${game.gameKey}`}>
                  <button
                    className="tracking-game-link"
                    tabIndex={browseTabIndex}
                    type="button"
                    onClick={() => onOpen(game.gameKey)}
                  >
                    {game.gameShortTitle}
                  </button>
                </h3>
                <span
                  className="tracking-badge"
                  data-availability={owned ? 'in-library' : game.availability}
                >
                  {playStateLabel(game)}
                </span>
                <button
                  aria-label={`Track ${game.gameShortTitle}`}
                  aria-pressed={watched}
                  className="watch-toggle"
                  tabIndex={browseTabIndex}
                  type="button"
                  onClick={() => onToggleWatch(game.gameKey)}
                >
                  <Heart aria-hidden="true" size={13} />
                  {watched ? 'Tracked' : 'Track'}
                </button>
              </div>
              <div className="tracking-table">
                {game.projects.map((project) => {
                  const installState = projectInstallState(project, library);
                  const downloadPage = projectDownloadUrl(project);
                  const isConsumerPort = CONSUMER_PORT_TYPES.includes(project.projectType);
                  return (
                    <article className="tracking-row" key={project.id}>
                      <CapsuleThumb art={art} title={game.gameShortTitle} />
                      <div>
                        <h4>
                          <button
                            className="tracking-row-link"
                            tabIndex={browseTabIndex}
                            type="button"
                            onClick={() => onOpen(game.gameKey)}
                          >
                            {project.projectName}
                          </button>
                        </h4>
                        <p>
                          {project.completionLabel === PLACEHOLDER_COMPLETION_LABEL
                            ? '—'
                            : project.completionLabel}
                        </p>
                      </div>
                      <span>{PROJECT_TYPE_LABELS[project.projectType]}</span>
                      <span>
                        {project.developmentState}
                        {project.stability !== 'unknown' ? ` · ${project.stability}` : ''}
                      </span>
                      <span className="release-cell">
                        {project.latestVersion ?? '—'}
                      </span>
                      {installState === 'in-library' ? (
                        <InLibraryButton
                          gameId={libraryGameId(project)}
                          gameName={game.gameShortTitle}
                          tabIndex={browseTabIndex}
                          onOpenInLibrary={onOpenInLibrary}
                        />
                      ) : installState === 'none' &&
                        project.downloadAssets.length === 0 &&
                        !downloadPage ? (
                        <span className="tracking-source-note">
                          {isConsumerPort ? '—' : 'Source only'}
                        </span>
                      ) : (
                        <ProjectDownloadControl
                          installState={installState}
                          project={project}
                          realDownloads={onDownloadProject !== undefined}
                          onDownloadAsset={onDownloadAsset}
                          onDownloadProject={onDownloadProject}
                          tabIndex={browseTabIndex}
                        />
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        </div>
      )}
    </div>
  );
}

function StoreShelf({ title, children }: { title: string; children: ReactNode }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const items = Children.toArray(children);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const capsules = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('.store-capsule'),
    ];
    const current = capsules.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || capsules.length === 0) return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = (current + offset + capsules.length) % capsules.length;
    setActiveIndex(next);
    capsules[next].focus();
  }

  return (
    <section aria-label={title} className="store-shelf">
      <h3 className="store-section-title">{title}</h3>
      <div className="store-shelf-track" onKeyDown={onKeyDown}>
        {items.map((child, index) =>
          cloneElement(child as ReactElement<StoreCapsuleProps>, {
            tabIndex: index === activeIndex ? 0 : -1,
          }),
        )}
      </div>
    </section>
  );
}

interface StoreCapsuleProps {
  game: TrackedGame;
  art: string[];
  coverAspect: number | null;
  playState: string;
  onOpen(gameKey: string): void;
  tabIndex?: number;
}

// A store card is a square box-art tile with the title in the footer. The
// title does not sit over the art: box scans carry their own title, usually
// across the middle or the top, and a second one burned over the bottom edge
// competes with it and covers the artwork.
//
// coverAspect is passed so a scan whose shape is far off the square keeps its
// whole box over a plinth instead of being cropped to fit. On the old 2:3
// tile that treatment was conspicuous — a landscape box filled 40% of a
// portrait slot and read as a different kind of tile. On a square tile the
// same box fills ~70%, so the bands are thin, the row still reads uniform,
// and "SUPER SMASH BROS." keeps the word SUPER.
function StoreCapsule({
  game,
  art,
  coverAspect,
  playState,
  onOpen,
  tabIndex = 0,
}: StoreCapsuleProps) {
  return (
    <button className="store-capsule" tabIndex={tabIndex} type="button" onClick={() => onOpen(game.gameKey)}>
      <span
        className="store-capsule-art"
        style={{ background: capsuleGradient(game.gameShortTitle) }}
      >
        {art.length > 0 ? (
          <>
            <ArtImage candidates={art} coverAspect={coverAspect} lazy />
            <span className="visually-hidden">{game.gameShortTitle}</span>
          </>
        ) : (
          <span className="store-capsule-name">{game.gameShortTitle}</span>
        )}
      </span>
      <span className="store-capsule-foot">
        <span className="store-capsule-title" title={game.gameShortTitle}>
          {game.gameShortTitle}
        </span>
        <span className="store-capsule-meta">
          {[
            game.originalPlatforms[0],
            game.originalReleaseYear > 0 ? String(game.originalReleaseYear) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {playState !== 'Released' ? (
          <span className="store-capsule-status">{playState}</span>
        ) : null}
      </span>
    </button>
  );
}

interface FeaturedCapsuleProps {
  game: TrackedGame;
  art: string[];
  library: LibraryEntry[];
  playState: string;
  realDownloads: boolean;
  onOpen(gameKey: string): void;
  onOpenInLibrary(gameId: string): void;
  onDownloadProject?(project: TrackedProject): void;
  onDownloadAsset?(project: TrackedProject, asset: DownloadAsset): void;
}

// Steam's featured hero: a cropped, full-bleed capture under a gradient
// scrim with a left-aligned title/CTA cluster and small screenshot thumbs
// that swap the hero. No blur wash — landscape screenshots lead; box art is
// the cropped fallback.
function FeaturedCapsule({
  game,
  art,
  library,
  playState,
  realDownloads,
  onOpen,
  onOpenInLibrary,
  onDownloadProject,
  onDownloadAsset,
}: FeaturedCapsuleProps) {
  const shots = gameScreenshots(game).slice(0, FEATURED_SHOT_LIMIT);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroShot = shots.length > 0 ? shots[Math.min(heroIndex, shots.length - 1)] : null;
  const linkedProject = game.projects.find((project) => project.gameId) ?? game.projects[0];
  const installState = projectInstallState(linkedProject, library);
  return (
    <section aria-label="Featured & Recommended" className="store-featured">
      <h3 className="store-section-title">Featured &amp; Recommended</h3>
      <div className="featured-capsule">
        <button
          aria-label={`View ${game.gameShortTitle}`}
          className="featured-art"
          style={{ background: capsuleGradient(game.gameShortTitle) }}
          type="button"
          onClick={() => onOpen(game.gameKey)}
        >
          {heroShot ? (
            <img
              alt=""
              key={heroShot}
              src={heroShot}
              onError={() => setHeroIndex((index) => index + 1)}
            />
          ) : (
            <ArtImage candidates={art} />
          )}
          {!heroShot && art.length === 0 ? (
            <span className="featured-art-fallback">{game.gameShortTitle}</span>
          ) : null}
        </button>
        <div className="featured-info">
          <p className="featured-title">{game.gameShortTitle}</p>
          <p className="featured-sub">
            {[
              game.originalReleaseYear > 0 ? String(game.originalReleaseYear) : null,
              ...game.originalPlatforms,
              game.projects.length > 1 ? `${game.projects.length} implementations tracked` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <span className="tracking-badge featured-status" data-availability={game.availability}>
            {playState}
          </span>
          {game.description ? <p className="featured-desc">{game.description}</p> : null}
          {shots.length > 0 ? (
            <div className="featured-thumbs" role="list">
              {shots.map((shot, index) => (
                <button
                  aria-current={index === Math.min(heroIndex, shots.length - 1)}
                  aria-label={`Preview screenshot ${index + 1}`}
                  className="featured-thumb"
                  key={shot}
                  type="button"
                  onClick={() => setHeroIndex(index)}
                  onFocus={() => setHeroIndex(index)}
                  onMouseEnter={() => setHeroIndex(index)}
                >
                  <img alt="" loading="lazy" src={shot} />
                </button>
              ))}
            </div>
          ) : null}
          <div className="featured-actions">
            {installState === 'in-library' && linkedProject.gameId !== null ? (
              <InLibraryButton
                gameId={linkedProject.gameId}
                gameName={game.gameShortTitle}
                onOpenInLibrary={onOpenInLibrary}
              />
            ) : (
              <ProjectDownloadControl
                installState={installState}
                primaryClassName="featured-download"
                project={linkedProject}
                realDownloads={realDownloads}
                onDownloadAsset={onDownloadAsset}
                onDownloadProject={onDownloadProject}
              />
            )}
            <button className="featured-browse" type="button" onClick={() => onOpen(game.gameKey)}>
              All implementations
              <ChevronRight aria-hidden="true" size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
