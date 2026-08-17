import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as appModule from './App';
import { seedState } from './data/seed';
import type { Download, Game, LibraryEntry, TrackedGame, TrackedProject } from './domain/types';
import { createBrowserBridge } from './platform/browser-store';
import { AppHeader } from './ui/app-header';
import { DownloadsBar } from './ui/downloads-bar';
import { FriendsPanel } from './ui/friends-panel';
import { LibraryView } from './ui/library-view';
import { ModsView } from './ui/mods-view';
import { SignInDialog } from './ui/sign-in-dialog';
import { StoreGamePage } from './ui/store-game-page';
import { StoreView } from './ui/store-view';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

// App-level assertions target the visual downloads bar while its dedicated
// polite status node announces only throttled milestones.
function downloadsStatus() {
  const status = document.querySelector('.downloads-bar');
  expect(status).toBeDefined();
  return status as HTMLElement;
}

function loadApp() {
  const App = (appModule as { App?: typeof import('./App')['App'] }).App;
  expect(typeof App).toBe('function');
  return App;
}

function makeProject(overrides: Partial<TrackedProject> = {}): TrackedProject {
  return {
    id: 'testport',
    gameKey: 'test-game',
    gameTitle: 'Test Game',
    gameShortTitle: 'Test Game',
    gameId: null,
    description: null,
    projectName: 'TestPort',
    projectType: 'source-port',
    developmentState: 'active',
    stability: 'playable',
    completionPercent: null,
    completionLabel: 'Playable',
    originalReleaseYear: 0,
    originalPlatforms: ['DOS'],
    targetPlatforms: [],
    latestVersion: null,
    lastActivityAt: null,
    lastCheckedAt: null,
    downloadUrl: null,
    coverUrl: null,
    coverAspect: null,
    screenshots: [],
    topics: [],
    recentReleases: [],
    downloadAssets: [],
    repositoryUrl: 'https://github.com/example/testport',
    ...overrides,
  };
}

function makeGame(overrides: Partial<TrackedGame> = {}): TrackedGame {
  return {
    gameKey: 'test-game',
    gameTitle: 'Test Game',
    gameShortTitle: 'Test Game',
    originalReleaseYear: 0,
    originalPlatforms: ['DOS'],
    availability: 'playable',
    latestActivityAt: null,
    description: 'A test game.',
    coverUrl: null,
    projects: [makeProject()],
    ...overrides,
  };
}

describe('Classicomp desktop shell', () => {
  it('opens on the store as the main page with an empty account library', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    expect(await screen.findByRole('heading', { name: 'Store' })).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Store',
      'Library',
      'Mods',
      'Roadmap',
    ]);
    expect(screen.getByRole('tab', { name: 'Store' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Library' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Mods' })).toBeVisible();
    expect(downloadsStatus()).toHaveTextContent('No active downloads');

    await user.click(screen.getByRole('tab', { name: 'Library' }));
    expect(await screen.findByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Browse the Store' })).toBeVisible();
  });

  it('suggests games from the persistent header search and opens the page', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);
    await screen.findByRole('heading', { name: 'Store' });

    const search = screen.getByRole('combobox', { name: 'Search the store' });
    await user.type(search, 'banjo');
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((option) => option.textContent?.includes('Banjo-Kazooie'))).toBe(true);

    await user.click(
      options.find((option) => option.textContent?.includes('Banjo-Kazooie')) ?? options[0],
    );
    expect(
      await screen.findByRole('heading', { name: 'Banjo-Kazooie', level: 2 }),
    ).toBeVisible();
    // Choosing a suggestion clears the box for the next search.
    expect(search).toHaveValue('');
  });

  it('makes Skip to content the first tab stop and focuses the active view', async () => {
    const App = loadApp();
    if (!App) return;
    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#active-view');
    await user.keyboard('{Enter}');
    expect(document.getElementById('active-view')).toHaveFocus();
  });

  it('lists the playable catalog in the store', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    expect(screen.getByRole('tab', { name: 'Store' })).toHaveAttribute('aria-selected', 'true');

    // The front page is shelves-only: no browse rows until the user opens
    // Browse from the store nav.
    expect(document.querySelector('.tracking-game')).toBeNull();
    expect(
      document.querySelectorAll('.store-capsule-art img').length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('.store-capsule-title')?.textContent).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'On your tracker' })).toBeVisible();

    // Browse holds the playable catalog: Diablo ships a real port; The Wind
    // Waker is a source-only matching decompilation and stays off the
    // storefront, and ScummVM is an engine, not a game. (Perfect Dark used to
    // be the example here, but its PC port now publishes real builds
    // including pd-x86_64-linux.tar.gz, so it belongs on the storefront.)
    await user.click(screen.getByRole('button', { name: 'Browse' }));
    expect(await screen.findByRole('heading', { name: 'Diablo' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'The Wind Waker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ScummVM' })).not.toBeInTheDocument();
    const count = Number(
      screen.getByText(/of \d+ games/).textContent?.match(/of (\d+) games/)?.[1],
    );
    expect(count).toBeGreaterThan(40);
    expect(count).toBeLessThan(100);
    expect(
      document.querySelectorAll('.tracking-row img[src*="opengraph.githubassets.com"]'),
    ).toHaveLength(0);
  });

  it('queues a store game into the library from its release-page fallback', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('button', { name: 'Browse' }));
    // DevilutionX carries baked release assets, so this is a REAL download:
    // it queues into the library, streams (test fetch is stubbed, so it takes
    // the browser-managed fallback), and completes. Scope to the Diablo
    // browse section — the featured capsule can carry the same project.
    const diabloSection = within(document.getElementById('store-game-diablo') as HTMLElement);
    await user.click(
      await diabloSection.findByRole('button', { name: /^Download DevilutionX,/ }),
    );

    expect(downloadsStatus()).toHaveTextContent('Downloads (1)');
    // Completion flips the store row to owned and the library entry to
    // *downloaded* — never "installed" without a verified recipe.
    const diabloRow = within(document.getElementById('store-game-diablo') as HTMLElement);
    expect(
      await diabloRow.findByRole('button', { name: 'Open Diablo in library' }),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Library' }));
    expect(
      await screen.findByRole('heading', { name: 'Diablo', level: 2 }),
    ).toBeVisible();
    // PLAY stays the primary action and Install stands beside it, so the bar
    // reads as one step left rather than hiding what the player came for.
    // PLAY is disabled only because the download is still an unopened archive.
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Install' })).toBeVisible();

    const persisted = JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}') as {
      libraries: Record<string, Array<{ gameId: string; installState: string }>>;
      downloads: unknown[];
    };
    expect(persisted.libraries.owner).toEqual([
      {
        gameId: 'devilutionx',
        installState: 'downloaded',
        // Downloading records the artifact it saved. installPath stays null:
        // that is the runnable thing, and nothing has been installed yet.
        downloadedFile: 'devilutionx-linux-x86_64.appimage',
        installPath: null,
        playMinutes: 0,
        romPath: null,
        // Nothing is installed yet, so there is no version to go stale.
        installedVersion: null,
      },
    ]);
    expect(persisted.downloads).toHaveLength(1);

    // A downloaded artifact is not a game yet: Install stands beside a greyed
    // PLAY. Set up is not offered at this point — linking an original copy is
    // optional and only meaningful once something is actually installed.
    expect(screen.getByRole('button', { name: 'Install' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Set up' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('opens a per-game page from the store and downloads from it', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('button', { name: 'Browse' }));

    // Clicking the implementation name in a browse row stays in-app and opens
    // the game page (it must never leave for the repository), which shows the
    // short name big with the full title as secondary text.
    await user.click(screen.getByRole('button', { name: 'Dusklight' }));
    expect(
      await screen.findByRole('heading', { name: 'Twilight Princess', level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByText(/The Legend of Zelda: Twilight Princess · 2006 ·/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Track Twilight Princess' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // The implementation name is plain text; the only external repository
    // affordance is the explicit labeled GitHub link beside it.
    expect(screen.queryByRole('link', { name: 'Dusklight' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the Dusklight repository' }),
    ).toHaveAttribute('href', 'https://github.com/TwilitRealm/dusklight');
    // The description appears in About and again as the right-rail glance
    // snippet, Steam-style.
    expect(
      screen.getAllByText(
        'Dusklight brings a classic adventure to PC and mobile platforms with a variety of fixes and improvements.',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('Decompilation of The Legend of Zelda: Twilight Princess'),
    ).toBeVisible();
    // The right rail opens with the portrait cover; it prefers the pulled box
    // art, with the OpenGraph card as the fallback.
    expect(document.querySelector('.game-page-cover img')).toHaveAttribute(
      'src',
      'https://upload.wikimedia.org/wikipedia/en/0/0e/The_Legend_of_Zelda_Twilight_Princess_Game_Cover.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled',
    );

    // The recent-updates feed lists releases across the game's projects.
    expect(screen.getByRole('heading', { name: 'Recent updates' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'v1.4.1' })).toHaveAttribute(
      'href',
      'https://github.com/TwilitRealm/dusklight/releases/tag/v1.4.1',
    );

    // Dusklight has real release assets. It carries no seeded gameId — most of
    // the catalogue does not — and it still enters the queue and the library,
    // because a download the player cannot find afterwards is a bug, not a
    // design. The CTA box atop the right rail and the Implementations row both
    // carry the action; either works.
    await user.click((await screen.findAllByRole('button', { name: /^Download Dusklight,/ }))[0]);
    expect(downloadsStatus()).toHaveTextContent('Twilight Princess');

    await user.click(screen.getByRole('tab', { name: 'Library' }));
    expect(
      await screen.findByRole('heading', { name: 'The Legend of Zelda: Twilight Princess', level: 2 }),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Store' }));

    await user.click(screen.getByRole('button', { name: 'Store' }));
    expect(await screen.findByRole('heading', { name: 'Store' })).toBeVisible();

    // A store-linked game queues into the library when downloaded from its page.
    await user.click(screen.getByRole('button', { name: 'Diablo' }));
    expect(
      screen.getAllByText('Diablo build for modern operating systems.').length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('.game-page-cover img')).toHaveAttribute(
      'src',
      'https://upload.wikimedia.org/wikipedia/en/3/3a/Diablo_Coverart.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled',
    );
    // The CTA box leads the right rail and names the chosen file.
    expect(screen.getByText('Get Diablo')).toBeVisible();
    await user.click((await screen.findAllByRole('button', { name: /^Download DevilutionX,/ }))[0]);
    // Two now: Dusklight queued earlier in this test, and every download
    // queues regardless of whether the project carries a seeded gameId.
    expect(downloadsStatus()).toHaveTextContent('Downloads (2)');
    expect(
      (await screen.findAllByRole('button', { name: 'Open Diablo in library' }))[0],
    ).toBeVisible();
  });

  it('remembers the open game page when tabbing away and back', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('button', { name: 'Browse' }));
    await user.click(screen.getByRole('button', { name: 'Twilight Princess' }));
    expect(
      await screen.findByRole('heading', { name: 'Twilight Princess', level: 2 }),
    ).toBeVisible();

    // Tab away and back: the store reopens the same game page rather than
    // resetting to the storefront.
    await user.click(screen.getByRole('tab', { name: 'Library' }));
    await screen.findByRole('heading', { name: 'Your library is empty' });
    await user.click(screen.getByRole('tab', { name: 'Store' }));
    expect(
      await screen.findByRole('heading', { name: 'Twilight Princess', level: 2 }),
    ).toBeVisible();

    // The back arrow returns to the browse list it came from.
    await user.click(screen.getByRole('button', { name: 'Store' }));
    expect(await screen.findByRole('heading', { name: 'Store' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Diablo' })).toBeVisible();
  });

  it('signs out to the sign-in screen and back in as another profile', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('button', { name: /The Dictator/ }));
    await user.click(screen.getByRole('menuitem', { name: /Sign out/ }));

    expect(await screen.findByRole('heading', { name: 'Sign in to Classicomp' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Library' })).not.toBeInTheDocument();
    const signedOutSkip = screen.getByRole('link', { name: 'Skip to content' });
    signedOutSkip.focus();
    await user.keyboard('{Enter}');
    expect(document.getElementById('active-view')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Guest/ }));
    expect(await screen.findByRole('heading', { name: 'Store' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Guest/ })).toBeVisible();
  });

  it('keeps source-only and in-development projects off the storefront', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });

    // Animal Forest is tracked (decompilation, no playable build) but must
    // not appear anywhere on the storefront: no browse row, no search hit.
    const search = screen.getByRole('combobox', { name: 'Search the store' });
    await user.type(search, 'Animal Forest');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.queryByRole('option', { name: /Animal Forest/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Browse' }));
    expect(screen.queryByRole('button', { name: 'Animal Forest' })).not.toBeInTheDocument();
    // Playable games keep their listings.
    expect(screen.getByRole('button', { name: 'Twilight Princess' })).toBeVisible();
  });

  it('configures a PayPal donate button from the account menu', async () => {
    const App = loadApp();
    if (!App) return;
    window.localStorage.removeItem('classicomp.donate-url');

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    expect(screen.queryByRole('link', { name: /Support Classicomp/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /The Dictator/ }));
    await user.click(screen.getByRole('menuitem', { name: /Donate button/ }));
    const input = await screen.findByLabelText('PayPal.me name or donate link');
    await user.type(input, 'examplehandle');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Configuring a link stores it, but nothing in the app asks anyone for
    // money — the Roadmap is a product plan, not a pitch.
    expect(window.localStorage.getItem('classicomp.donate-url')).toBe(
      'https://paypal.me/examplehandle',
    );
    await user.click(screen.getByRole('tab', { name: 'Roadmap' }));
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Support Classicomp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Supporting/ })).not.toBeInTheDocument();
    window.localStorage.removeItem('classicomp.donate-url');
  });

  it('filters the store by search text and status', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('button', { name: 'Browse' }));

    // The search box is debounced (~150ms), so filtered-out games disappear a
    // beat after the last keystroke.
    await user.type(screen.getByRole('searchbox', { name: 'Search store' }), 'diablo');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Twilight Princess' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Diablo' })).toBeVisible();

    await user.clear(screen.getByRole('searchbox', { name: 'Search store' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'playable');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Diablo' })).not.toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'all');
    await user.type(screen.getByRole('searchbox', { name: 'Search store' }), 'zzzz');
    expect(await screen.findByText('No games match these filters.', { exact: false })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('heading', { name: 'Twilight Princess' })).toBeVisible();
  });

  it('wishlists store games per profile and persists the wishlist', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('button', { name: 'Browse' }));

    expect(screen.getByRole('button', { name: 'Tracker (1)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const seededWishlist = await screen.findByRole('button', {
      name: "Track Majora's Mask",
    });
    expect(seededWishlist).toHaveAttribute('aria-pressed', 'true');
    expect(seededWishlist).toHaveTextContent('Tracked');

    const wishlistStarFox = screen.getByRole('button', { name: 'Track Star Fox 64' });
    expect(wishlistStarFox).toHaveAttribute('aria-pressed', 'false');
    await user.click(wishlistStarFox);
    expect(screen.getByRole('button', { name: 'Track Star Fox 64' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const persisted = JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}') as {
      watchlists: Record<string, string[]>;
    };
    expect(persisted.watchlists.owner).toContain('star-fox-64');

    // The wishlist chip switches the browse list to a headed wishlist view.
    await user.click(screen.getByRole('button', { name: 'Tracker (2)' }));
    expect(screen.getByRole('heading', { name: 'Your tracker' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Star Fox 64' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Diablo' })).not.toBeInTheDocument();

    // The store nav's wishlist section shows the same games as capsules.
    await user.click(screen.getByRole('button', { name: 'Open tracker, 2 games' }));
    expect(
      screen.getByRole('heading', { name: 'Your tracker', level: 3 }),
    ).toBeVisible();
    expect(document.querySelectorAll('.wishlist-grid .store-capsule')).toHaveLength(2);
  });

  it('runs a catch-up store scan on start and shows passive auto-update status', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const collectUpdates = vi.fn().mockResolvedValue([
      {
        id: 'zelda64-recompiled',
        latestVersion: '1.3.0',
        lastActivityAt: '2026-08-14T00:00:00Z',
        developmentState: null,
        downloadUrl: null,
        checkedAt: '2026-08-14T00:00:00Z',
      },
    ]);
    render(<App bridge={createBrowserBridge(storage)} collectUpdates={collectUpdates} />);

    await screen.findByRole('heading', { name: 'Store' });

    expect(await screen.findByText(/^Auto-updating · Last scan /)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Browse' }));
    expect(screen.getByText('1.3.0')).toBeVisible();
    expect(collectUpdates).toHaveBeenCalledTimes(1);
    expect(collectUpdates.mock.calls[0][0].length).toBeLessThanOrEqual(25);

    // The store auto-updates; there is no manual update button anymore.
    expect(
      screen.queryByRole('button', { name: /Check for updates/ }),
    ).not.toBeInTheDocument();

    const persisted = JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}') as {
      trackingLastScanAt: string | null;
    };
    expect(persisted.trackingLastScanAt).not.toBeNull();
  });

  it('shows the unreachable-sources failure text as passive scanline status', () => {
    render(
      <StoreView
        lastScanAt={null}
        library={[]}
        projects={[]}
        scanError="Sources unreachable — showing the last verified data."
        watchedGameKeys={new Set()}
        onInstall={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sources unreachable — showing the last verified data.',
    );
  });

  it('shows a pending first scan as passive scanline text', () => {
    render(
      <StoreView
        lastScanAt={null}
        library={[]}
        projects={[]}
        watchedGameKeys={new Set()}
        onInstall={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    expect(screen.getByText('First scan pending…')).toBeVisible();
  });

  it('announces a completed catalog scan through a polite live region', () => {
    const props = {
      library: [],
      projects: [],
      watchedGameKeys: new Set<string>(),
      onInstall: () => {},
      onOpenInLibrary: () => {},
      onToggleWatch: () => {},
    };
    const { rerender } = render(<StoreView {...props} lastScanAt={null} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');

    rerender(<StoreView {...props} lastScanAt="2026-08-15T12:00:00Z" />);
    expect(status).toHaveTextContent('Catalog updated');
  });

  it('shows per-game mods and toggles them for the active profile', async () => {
    const App = loadApp();
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'Store' });
    await user.click(screen.getByRole('tab', { name: 'Mods' }));

    expect(await screen.findByText('Tamriel Rebuilt')).toBeVisible();
    const toggle = screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);
    expect(screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    const persisted = JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}') as {
      mods: Record<string, Array<{ id: string; enabled: boolean }>>;
    };
    expect(
      persisted.mods.owner?.find((mod) => mod.id === 'mod-openmw-tamriel-rebuilt')?.enabled,
    ).toBe(false);
  });
});

describe('StoreGamePage content sections', () => {
  it('renders the screenshot gallery, tag chips, features, and updates feed', async () => {
    const user = userEvent.setup();
    const game = makeGame({
      projects: [
        makeProject({
          screenshots: [
            'https://example.com/shot-1.png',
            'https://example.com/shot-2.png',
            'https://example.com/shot-1.png',
          ],
          topics: ['multiplayer', 'mods', 'retro'],
          targetPlatforms: ['Windows', 'Linux'],
          recentReleases: [
            {
              version: 'v2.0.0',
              url: 'https://github.com/example/testport/releases/tag/v2.0.0',
              publishedAt: '2026-08-01T00:00:00Z',
            },
          ],
        }),
        makeProject({
          id: 'testport-mac',
          projectName: 'TestPort Mac',
          screenshots: ['https://example.com/shot-2.png'],
          topics: ['mods', 'co-op'],
          targetPlatforms: ['macOS'],
          recentReleases: [],
        }),
      ],
    });
    render(
      <StoreGamePage
        art={[]}
        game={game}
        library={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    // Screenshot gallery: union across projects, deduped, thumbnails swap the
    // main preview.
    const gallery = screen.getByRole('heading', { name: 'Screenshots' }).parentElement;
    expect(gallery).not.toBeNull();
    const mainShot = within(gallery as HTMLElement).getByAltText('Test Game screenshot 1');
    expect(mainShot).toHaveAttribute('src', 'https://example.com/shot-1.png');
    expect(screen.getAllByRole('button', { name: /Show screenshot/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Show screenshot 2' }));
    expect(screen.getByAltText('Test Game screenshot 2')).toHaveAttribute(
      'src',
      'https://example.com/shot-2.png',
    );

    // Tag chips live in the right-rail glance block, deduped across projects.
    const tags = screen.getByText('Popular tags').parentElement as HTMLElement;
    expect(within(tags).getAllByRole('listitem').map((chip) => chip.textContent)).toEqual([
      'multiplayer',
      'mods',
      'retro',
      'co-op',
    ]);

    // Steam-style feature lines inferred from topics and platforms.
    const meta = screen.getByLabelText('Game details');
    expect(within(meta).getByText('Multiplayer')).toBeVisible();
    expect(within(meta).getByText('Mod support')).toBeVisible();
    expect(within(meta).getByText('Cross-platform')).toBeVisible();

    // Recent updates feed.
    expect(screen.getByRole('heading', { name: 'Recent updates' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'v2.0.0' })).toHaveAttribute(
      'href',
      'https://github.com/example/testport/releases/tag/v2.0.0',
    );

    // Unknown (0) release years are hidden everywhere.
    expect(screen.queryByText('Release year')).not.toBeInTheDocument();
    // The subtitle no longer echoes the H2 title; only year/platform remain.
    expect(screen.getByText('DOS', { selector: '.game-page-subtitle' })).toBeVisible();
  });

  it('anchors the right rail with a CTA box naming the chosen asset', () => {
    const game = makeGame({
      projects: [
        makeProject({
          gameId: 'game-1',
          latestVersion: 'v1.0.0',
          downloadAssets: [
            {
              name: 'testport-linux-x86_64.AppImage',
              url: 'https://example.com/testport.AppImage',
              sizeBytes: 38 * 1024 * 1024,
            },
          ],
        }),
      ],
    });
    render(
      <StoreGamePage
        art={[]}
        game={game}
        library={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    const rail = screen.getByLabelText('Game details');
    expect(within(rail).getByText('Get Test Game')).toBeVisible();
    // Without a real-download handler the honest fallback is the release page.
    expect(
      within(rail).getByRole('link', { name: 'Open TestPort release page' }),
    ).toBeVisible();
  });

  it('anchors the CTA on the implementation that actually has a release', () => {
    const game = makeGame({
      projects: [
        makeProject({ id: 'decomp', projectName: 'Decomp', projectType: 'matching-decompilation' }),
        makeProject({
          id: 'recomp',
          projectName: 'Recomp',
          latestVersion: 'v0.1.87',
          downloadUrl: 'https://github.com/example/recomp/releases/tag/v0.1.87',
        }),
      ],
    });
    render(
      <StoreGamePage
        art={[]}
        game={game}
        library={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    const rail = screen.getByLabelText('Game details');
    expect(
      within(rail).getByRole('link', { name: 'Open Recomp release page' }),
    ).toBeVisible();
  });

  it('offers the source archive and a setup guide when nothing is packaged', () => {
    const game = makeGame({
      projects: [makeProject({ projectType: 'matching-decompilation' })],
    });
    render(
      <StoreGamePage
        art={[]}
        game={game}
        library={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    // The CTA never dead-ends: with no release anywhere, it hands over the
    // repository source archive.
    const rail = screen.getByLabelText('Game details');
    expect(within(rail).getByRole('link', { name: 'Download source (.zip)' })).toHaveAttribute(
      'href',
      'https://github.com/example/testport/archive/HEAD.zip',
    );

    // The implementation row mirrors it and carries the build steps.
    expect(screen.getByRole('link', { name: 'Source (.zip)' })).toBeVisible();
    expect(screen.getByText('Setup guide')).toBeVisible();
    expect(
      screen.getByText(/Install the build toolchain listed in the project README/),
    ).toBeInTheDocument();
  });

  it('shows a setup guide on every implementation', () => {
    const game = makeGame({
      projects: [
        makeProject({ id: 'a', projectName: 'A' }),
        makeProject({ id: 'b', projectName: 'B', latestVersion: 'v1.0.0' }),
      ],
    });
    render(
      <StoreGamePage
        art={[]}
        game={game}
        library={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    expect(screen.getAllByText('Setup guide')).toHaveLength(2);
  });

  it('shows the top 3 live mods for store-linked games and links to the Mods tab', async () => {
    const user = userEvent.setup();
    const onOpenMods = vi.fn();
    const game = makeGame({ projects: [makeProject({ gameId: 'game-1' })] });
    const mods = [1, 2, 3, 4].map((n) => ({
      id: `m${n}`,
      gameId: 'game-1',
      name: `Mod ${n}`,
      summary: `Summary ${n}`,
      url: `https://example.com/m${n}`,
      author: 'modder',
      stars: n,
      updatedAt: null,
    }));
    render(
      <StoreGamePage
        art={[]}
        game={game}
        library={[]}
        liveMods={mods}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onOpenMods={onOpenMods}
        onToggleWatch={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Mods' })).toBeVisible();
    expect(screen.getByText('Mod 3')).toBeVisible();
    expect(screen.queryByText('Mod 4')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'See all in Mods' }));
    expect(onOpenMods).toHaveBeenCalledTimes(1);
  });

  it('hides the Mods section without live mods or a store link', () => {
    render(
      <StoreGamePage
        art={[]}
        game={makeGame()}
        library={[]}
        liveMods={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onOpenMods={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Mods' })).not.toBeInTheDocument();
  });

  it('hides the gallery, tags, and updates sections when there is no data', () => {    render(
      <StoreGamePage
        art={[]}
        game={makeGame()}
        library={[]}
        watched={false}
        onBack={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Screenshots' })).not.toBeInTheDocument();
    expect(screen.queryByText('Popular tags')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent updates' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Implementations' })).toBeVisible();
  });
});

describe('Store download UX', () => {
  const MIB = 1024 * 1024;

  // Renders the store and lands on Browse, where the download controls live.
  async function renderStoreWith(
    project: TrackedProject,
    handlers: Partial<Parameters<typeof StoreView>[0]> = {},
  ) {
    const view = render(
      <StoreView
        lastScanAt={null}
        library={[]}
        projects={[project]}
        watchedGameKeys={new Set()}
        onInstall={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
        {...handlers}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Browse' }));
    return view;
  }

  it('starts the real download of the auto-picked asset and names it', async () => {
    const user = userEvent.setup();
    const onDownloadProject = vi.fn();
    vi.mocked(window.open).mockClear();
    const project = makeProject({
      latestVersion: 'v1.0.0',
      downloadAssets: [
        {
          name: 'testport-linux-x86_64.AppImage',
          url: 'https://example.com/testport-linux.AppImage',
          sizeBytes: 38 * MIB,
        },
      ],
    });
    await renderStoreWith(project, { onDownloadProject });

    const button = await screen.findByRole('button', {
      name: 'Download TestPort, testport-linux-x86_64.AppImage, 38 MB',
    });
    // The auto-picked asset is named, with a human size, next to the button.
    expect(screen.getByText('testport-linux-x86_64.AppImage · 38 MB')).toBeVisible();
    await user.click(button);
    expect(onDownloadProject).toHaveBeenCalledTimes(1);
    expect(onDownloadProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'testport' }));
    expect(window.open).not.toHaveBeenCalled();
  });

  it('names the same preferred x86 AppImage that the downloader will start', async () => {
    const project = makeProject({
      downloadAssets: [
        {
          name: 'testport-linux-aarch64.tar.xz',
          url: 'https://example.com/testport-arm.tar.xz',
          sizeBytes: 20 * MIB,
        },
        {
          name: 'testport-linux-x86_64.appimage',
          url: 'https://example.com/testport-x86.appimage',
          sizeBytes: 38 * MIB,
        },
      ],
    });
    await renderStoreWith(project, { onDownloadProject: vi.fn() });

    expect(
      await screen.findByRole('button', {
        name: 'Download TestPort, testport-linux-x86_64.appimage, 38 MB',
      }),
    ).toBeVisible();
    expect(screen.getByText('testport-linux-x86_64.appimage · 38 MB')).toBeVisible();
  });

  it('lists every release asset in a menu that starts the chosen file', async () => {
    const user = userEvent.setup();
    const onDownloadAsset = vi.fn();
    const assets = [
      {
        name: 'testport-linux-x86_64.AppImage',
        url: 'https://example.com/testport-linux.AppImage',
        sizeBytes: 38 * MIB,
      },
      {
        name: 'testport-windows-x64.zip',
        url: 'https://example.com/testport-win.zip',
        sizeBytes: 41 * MIB,
      },
    ];
    const project = makeProject({ latestVersion: 'v1.0.0', downloadAssets: assets });
    await renderStoreWith(project, { onDownloadAsset, onDownloadProject: vi.fn() });

    const toggle = await screen.findByRole('button', { name: 'Choose download file' });
    await user.click(toggle);
    expect(screen.getByRole('menuitem', { name: /testport-linux-x86_64\.AppImage/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    const item = screen.getByRole('menuitem', { name: /testport-windows-x64\.zip/ });
    expect(item).toHaveFocus();
    expect(item).toHaveTextContent('41 MB');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onDownloadAsset).toHaveBeenCalledTimes(1);
    expect(onDownloadAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'testport' }),
      assets[1],
    );
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('labels the release-page fallback honestly when no assets exist', async () => {
    const user = userEvent.setup();
    vi.mocked(window.open).mockClear();
    const project = makeProject({ latestVersion: 'v2.1.0' });
    await renderStoreWith(project, { onDownloadProject: vi.fn() });

    const link = await screen.findByRole('link', { name: 'Open TestPort release page' });
    expect(link).toHaveTextContent('Release page');
    expect(link).toHaveAttribute('href', 'https://github.com/example/testport/releases/latest');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('reflects library download state on store-linked projects', async () => {
    const library: LibraryEntry[] = [
      { gameId: 'game-queued', installState: 'queued', installPath: null, playMinutes: 0 },
      { gameId: 'game-installed', installState: 'installed', installPath: '/games/x', playMinutes: 12 },
    ];
    const queued = makeProject({
      id: 'p-queued',
      gameKey: 'queued-game',
      gameTitle: 'Queued Game',
      gameShortTitle: 'Queued Game',
      projectName: 'QueuedPort',
      gameId: 'game-queued',
      latestVersion: 'v1.0.0',
      downloadAssets: [
        { name: 'queuedport.AppImage', url: 'https://example.com/qp', sizeBytes: null },
      ],
    });
    const installed = makeProject({
      id: 'p-installed',
      gameKey: 'installed-game',
      gameTitle: 'Installed Game',
      gameShortTitle: 'Installed Game',
      projectName: 'InstalledPort',
      gameId: 'game-installed',
      latestVersion: 'v3.0.0',
    });
    render(
      <StoreView
        lastScanAt={null}
        library={library}
        projects={[queued, installed]}
        watchedGameKeys={new Set()}
        onDownloadProject={vi.fn()}
        onInstall={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Browse' }));

    const downloading = await screen.findByRole('button', { name: /^Download QueuedPort,/ });
    expect(downloading).toBeDisabled();
    expect(downloading).toHaveTextContent('Downloading…');
    expect(
      screen.getByRole('button', { name: 'Open Installed Game in library' }),
    ).toBeVisible();
  });

  it('uses roving tabindex for every shelf and for browse game groups', async () => {
    const user = userEvent.setup();
    const projects = [
      makeProject({ id: 'alpha', gameKey: 'alpha', gameTitle: 'Alpha', gameShortTitle: 'Alpha' }),
      makeProject({ id: 'beta', gameKey: 'beta', gameTitle: 'Beta', gameShortTitle: 'Beta' }),
    ];
    render(
      <StoreView
        lastScanAt={null}
        library={[]}
        projects={projects}
        watchedGameKeys={new Set()}
        onInstall={() => {}}
        onOpenInLibrary={() => {}}
        onToggleWatch={() => {}}
      />,
    );

    for (const track of document.querySelectorAll('.store-shelf-track')) {
      const capsules = [...track.querySelectorAll<HTMLButtonElement>('.store-capsule')];
      expect(capsules.filter((capsule) => capsule.tabIndex === 0)).toHaveLength(1);
      expect(capsules.slice(1).every((capsule) => capsule.tabIndex === -1)).toBe(true);
    }

    await user.click(screen.getByRole('button', { name: 'Browse' }));
    const browseGames = [...document.querySelectorAll<HTMLElement>('.tracking-game')];
    const secondControls = browseGames[1].querySelectorAll<HTMLElement>('a, button');
    expect([...secondControls].every((control) => control.tabIndex === -1)).toBe(true);

    const firstTitle = within(browseGames[0]).getByRole('button', { name: 'Alpha' });
    firstTitle.focus();
    await user.keyboard('{ArrowDown}');
    expect(within(browseGames[1]).getByRole('button', { name: 'Beta' })).toHaveFocus();
  });
});

describe('DownloadsBar live progress', () => {
  const game: Game = {
    id: 'g1',
    title: 'Test Game',
    shortTitle: 'Test Game',
    summary: '',
    description: '',
    artworkUrl: null,
    iconUrl: null,
    runtime: 'native',
    version: '1.0',
    executablePath: null,
    upstreamUrl: '',
    accent: '#000000',
    tags: [],
  };
  const download: Download = {
    id: 'download-owner-g1',
    profileId: 'owner',
    gameId: 'g1',
    state: 'downloading',
    progress: 0,
    bytesPerSecond: 0,
    etaSeconds: null,
  };
  const live = { received: 64 * 1024 * 1024, total: 128 * 1024 * 1024, bytesPerSecond: 6_500_000 };

  it('renders real percentage progress with size and speed', () => {
    render(
      <DownloadsBar
        downloads={[download]}
        games={[game]}
        open={false}
        progress={{ [download.id]: live }}
        onToggle={() => {}}
      />,
    );

    expect(downloadsStatus()).toHaveTextContent('64 MB of 128 MB · 6.2 MB/s');
    const fill = document.querySelector('.downloads-progress > span') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('renders an indeterminate bar when the total size is unknown', () => {
    render(
      <DownloadsBar
        downloads={[download]}
        games={[game]}
        open={false}
        progress={{ [download.id]: { ...live, total: null } }}
        onToggle={() => {}}
      />,
    );

    expect(downloadsStatus()).toHaveTextContent('64 MB · 6.2 MB/s');
    expect(document.querySelector('.downloads-progress')).toHaveClass('indeterminate');
  });

  it('shows live progress inside the open queue rows', () => {
    render(
      <DownloadsBar
        downloads={[download]}
        games={[game]}
        open
        progress={{ [download.id]: live }}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByLabelText('Download queue')).toHaveTextContent(
      '64 MB of 128 MB · 6.2 MB/s',
    );
  });

  it('shows the active-download label when no live progress is wired', () => {
    render(
      <DownloadsBar downloads={[download]} games={[game]} open={false} onToggle={() => {}} />,
    );

    expect(downloadsStatus()).toHaveTextContent('Downloading…');
    expect(screen.queryByText(/verified install recipe/)).not.toBeInTheDocument();
    expect(document.querySelector('.downloads-progress')).not.toHaveClass('indeterminate');
  });

  it('says Downloaded with a View in Library action once complete', async () => {
    const user = userEvent.setup();
    const onViewInLibrary = vi.fn();
    render(
      <DownloadsBar
        downloads={[{ ...download, state: 'complete', progress: 100 }]}
        games={[game]}
        open={false}
        onToggle={() => {}}
        onViewInLibrary={onViewInLibrary}
      />,
    );

    const bar = downloadsStatus();
    expect(bar).toHaveTextContent('Downloaded');
    // No forever-full progress bar for a finished download.
    expect(bar.querySelector('.downloads-progress')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'View Test Game in library' }));
    expect(onViewInLibrary).toHaveBeenCalledWith('g1');
  });

  it('auto-collapses the queue a few seconds after completion', () => {
    vi.useFakeTimers();
    try {
      const onToggle = vi.fn();
      render(
        <DownloadsBar
          downloads={[{ ...download, state: 'complete', progress: 100 }]}
          games={[game]}
          open
          onToggle={onToggle}
        />,
      );

      expect(onToggle).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3999);
      expect(onToggle).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(onToggle).toHaveBeenCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not show a waiting-for-recipe note during an active download', () => {
    render(
      <DownloadsBar
        downloads={[download]}
        games={[game]}
        open
        progress={{ [download.id]: live }}
        onToggle={() => {}}
      />,
    );

    const queue = screen.getByLabelText('Download queue');
    expect(queue).not.toHaveTextContent('Waiting for a verified install recipe');
    // Speed and ETA ride along with the transferred amounts.
    expect(queue).toHaveTextContent(/6\.2 MB\/s · \d+ min left/);
  });

  it('announces progress only at 25-percent milestones and announces completion', () => {
    const { rerender } = render(
      <DownloadsBar
        downloads={[download]}
        games={[game]}
        open={false}
        progress={{ [download.id]: { ...live, received: 0 } }}
        onToggle={() => {}}
      />,
    );
    const status = screen.getByRole('status', { name: 'Download updates' });
    expect(status).toHaveAttribute('aria-live', 'polite');

    rerender(
      <DownloadsBar downloads={[download]} games={[game]} open={false}
        progress={{ [download.id]: { ...live, received: 24 * 1024 * 1024 } }} onToggle={() => {}} />,
    );
    expect(status).toHaveTextContent('');

    rerender(
      <DownloadsBar downloads={[download]} games={[game]} open={false}
        progress={{ [download.id]: { ...live, received: 32 * 1024 * 1024 } }} onToggle={() => {}} />,
    );
    expect(status).toHaveTextContent('Test Game download 25%');

    rerender(
      <DownloadsBar downloads={[download]} games={[game]} open={false}
        progress={{ [download.id]: { ...live, received: 60 * 1024 * 1024 } }} onToggle={() => {}} />,
    );
    expect(status).toHaveTextContent('Test Game download 25%');

    rerender(
      <DownloadsBar downloads={[{ ...download, state: 'complete', progress: 100 }]}
        games={[game]} open={false} onToggle={() => {}} />,
    );
    expect(status).toHaveTextContent('Test Game download complete');
  });
});

describe('ModsView live mods', () => {
  const liveMods = [
    {
      id: 'live-1',
      gameId: 'openmw',
      name: 'Morrowind Live Overhaul',
      summary: 'A live community overhaul.',
      url: 'https://github.com/example/overhaul',
      author: 'modder',
      stars: 42,
      updatedAt: '2026-08-01T00:00:00Z',
    },
  ];

  it('renders live mod cards alongside the bundled toggles', () => {
    render(
      <ModsView
        games={seedState.games}
        liveMods={liveMods}
        mods={seedState.mods.owner}
        modsLoading={false}
        onToggleMod={() => {}}
      />,
    );

    expect(screen.getByText('Morrowind Live Overhaul')).toBeVisible();
    expect(screen.getByText('A live community overhaul.')).toBeVisible();
    expect(screen.getByText('modder')).toBeVisible();
    expect(screen.getByText('42')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'View mod Morrowind Live Overhaul' }),
    ).toHaveAttribute('target', '_blank');

    // Live discovery supplements the bundled list: the installed mods keep
    // their toggles next to the discovered cards, for the same game too.
    expect(screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Toggle Infernal Difficulty' })).toBeVisible();
  });

  it('shows a loading row while live mods load', () => {
    render(
      <ModsView
        games={seedState.games}
        liveMods={null}
        mods={seedState.mods.owner}
        modsLoading
        onToggleMod={() => {}}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading community mods…');
    expect(screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' })).toBeVisible();
  });

  it('renders exactly the bundled view when live props are omitted', () => {
    render(
      <ModsView games={seedState.games} mods={seedState.mods.owner} onToggleMod={() => {}} />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Toggle Tamriel Rebuilt' })).toBeVisible();
    expect(screen.queryByText('View mod', { exact: false })).not.toBeInTheDocument();
  });
});

describe('SignInDialog', () => {
  const baseProps = {
    configured: true,
    status: 'signedOut' as const,
    accountEmail: null,
    error: null,
    onSaveConfig: vi.fn(),
    onSubmit: vi.fn(),
    onSignOut: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders nothing when closed', () => {
    const { container } = render(<SignInDialog {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('collects Supabase config when not configured', async () => {
    const user = userEvent.setup();
    const onSaveConfig = vi.fn();
    render(<SignInDialog {...baseProps} configured={false} open onSaveConfig={onSaveConfig} />);

    expect(
      screen.getByRole('heading', { name: 'Connect your Supabase project' }),
    ).toBeVisible();
    await user.type(screen.getByLabelText('Project URL'), 'https://proj.supabase.co');
    await user.type(screen.getByLabelText('Anon key'), 'anon-key');
    await user.click(screen.getByRole('button', { name: 'Save connection' }));
    expect(onSaveConfig).toHaveBeenCalledWith('https://proj.supabase.co', 'anon-key');
  });

  it('signs in or creates an account with email and password', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SignInDialog {...baseProps} open onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledWith('me@example.com', 'hunter2', 'signIn');

    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).toHaveBeenCalledWith('me@example.com', 'hunter2', 'signUp');
  });

  it('shows the signed-in account and signs out', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(
      <SignInDialog
        {...baseProps}
        accountEmail="me@example.com"
        open
        status="signedIn"
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText('me@example.com')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('surfaces errors', () => {
    render(<SignInDialog {...baseProps} error="Invalid login credentials" open />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('takes focus, traps Tab in both directions, closes on Escape, and restores the opener', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open account</button>
          <SignInDialog {...baseProps} open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Open account' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Sign in' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    const controls = within(dialog).getAllByRole('button');
    controls.at(-1)?.focus();
    await user.tab();
    expect(controls[0]).toHaveFocus();
    controls[0].focus();
    await user.tab({ shift: true });
    expect(controls.at(-1)).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('FriendsPanel', () => {
  const friends = [
    { id: 'f1', displayName: 'Alice', email: 'alice@example.com', status: 'online' as const },
    { id: 'f2', displayName: 'Bob', email: 'bob@example.com', status: 'offline' as const },
  ];
  const pending = [
    { id: 'f3', displayName: 'Carol', email: 'carol@example.com', status: 'pending' as const },
  ];

  it('renders nothing when closed', () => {
    const { container } = render(
      <FriendsPanel
        error={null}
        friends={friends}
        open={false}
        pending={pending}
        onAddFriend={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('groups friends and adds new ones by email', async () => {
    const user = userEvent.setup();
    const onAddFriend = vi.fn();
    render(
      <FriendsPanel
        error={null}
        friends={friends}
        open
        pending={pending}
        onAddFriend={onAddFriend}
        onClose={() => {}}
      />,
    );

    const online = screen.getByLabelText('Online');
    expect(within(online).getByText('Alice')).toBeVisible();
    expect(within(online).queryByText('Bob')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Offline')).getByText('Bob')).toBeVisible();
    expect(within(screen.getByLabelText('Pending requests')).getByText('Carol')).toBeVisible();

    await user.type(screen.getByLabelText('Add friend by email'), 'dave@example.com');
    await user.click(screen.getByRole('button', { name: 'Add friend' }));
    expect(onAddFriend).toHaveBeenCalledWith('dave@example.com');
  });

  it('closes on Escape and on a backdrop click, like every overlay', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <FriendsPanel
        error={null}
        friends={friends}
        open
        pending={pending}
        onAddFriend={() => {}}
        onClose={onClose}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('.friends-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is a modal dialog that traps focus and restores the Friends opener', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Friends</button>
          <FriendsPanel
            error={null}
            friends={friends}
            open={open}
            pending={pending}
            onAddFriend={() => {}}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Friends' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Friends' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    const controls = within(dialog).getAllByRole('button');
    controls.at(-1)?.focus();
    await user.tab();
    expect(controls[0]).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('AppHeader account surfaces', () => {
  const profiles = seedState.profiles;

  it('renders friends button and account menu item when wired', async () => {
    const user = userEvent.setup();
    const onOpenSignIn = vi.fn();
    const onOpenFriends = vi.fn();
    render(
      <AppHeader
        accountEmail="me@example.com"
        activeProfile={profiles[0]}
        profiles={profiles}
        route="store"
        onActivateProfile={() => {}}
        onChangeRoute={() => {}}
        onOpenFriends={onOpenFriends}
        onOpenSignIn={onOpenSignIn}
        onSignOut={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Friends' }));
    expect(onOpenFriends).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /The Dictator/ }));
    const accountItem = screen.getByRole('menuitem', { name: 'me@example.com' });
    await user.click(accountItem);
    expect(onOpenSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders without account surfaces when the props are absent', () => {
    render(
      <AppHeader
        activeProfile={profiles[0]}
        profiles={profiles}
        route="store"
        onActivateProfile={() => {}}
        onChangeRoute={() => {}}
        onSignOut={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Friends' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Notifications/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /The Dictator/ })).toBeVisible();
  });

  it('surfaces release notices in a bell dropdown with link and dismiss', async () => {
    const user = userEvent.setup();
    const onDismissNotice = vi.fn();
    const onOpenNoticeGame = vi.fn();
    render(
      <AppHeader
        activeProfile={profiles[0]}
        profiles={profiles}
        releaseNotices={[
          {
            id: 'notice-1',
            gameKey: 'majoras-mask',
            gameShortTitle: "Majora's Mask",
            version: '5.0.1',
            url: 'https://example.com/2ship-5.0.1',
            noticedAt: '2026-08-15T10:00:00Z',
          },
        ]}
        route="store"
        onActivateProfile={() => {}}
        onChangeRoute={() => {}}
        onDismissNotice={onDismissNotice}
        onOpenNoticeGame={onOpenNoticeGame}
        onSignOut={() => {}}
      />,
    );

    const bell = screen.getByRole('button', { name: 'Notifications (1 new)' });
    expect(bell.textContent).toContain('1');

    await user.click(bell);
    await user.click(
      screen.getByRole('menuitem', { name: "Majora's Mask 5.0.1 is out" }),
    );
    expect(onOpenNoticeGame).toHaveBeenCalledWith('majoras-mask');

    await user.click(bell);
    expect(
      screen.getByRole('link', { name: "Open the Majora's Mask 5.0.1 release page" }),
    ).toHaveAttribute('href', 'https://example.com/2ship-5.0.1');
    await user.click(
      screen.getByRole('menuitem', { name: "Dismiss the Majora's Mask 5.0.1 notice" }),
    );
    expect(onDismissNotice).toHaveBeenCalledWith('notice-1');

    // Escape closes the dropdown.
    await user.click(bell);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders the bell without a badge when there are no notices', () => {
    render(
      <AppHeader
        activeProfile={profiles[0]}
        profiles={profiles}
        releaseNotices={[]}
        route="store"
        onActivateProfile={() => {}}
        onChangeRoute={() => {}}
        onSignOut={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible();
  });
});

describe('Library game context menu and dialogs', () => {
  const devilutionx = seedState.games.find((game) => game.id === 'devilutionx') as Game;

  // Stateful harness: App owns uninstall state, so the tests mirror that by
  // holding the library entries and dropping the uninstalled game.
  function LibraryHarness({ trackedProjects }: { trackedProjects?: TrackedProject[] }) {
    const [entries, setEntries] = useState<LibraryEntry[]>([
      {
        gameId: 'devilutionx',
        installState: 'installed',
        installPath: '/games/devilutionx',
        playMinutes: 90,
      },
    ]);
    return (
      <LibraryView
        entries={entries}
        games={seedState.games}
        hasCloudProvider={false}
        selectedGameId="devilutionx"
        trackedProjects={trackedProjects}
        onBrowseStore={() => {}}
        onQueueInstall={() => {}}
        onSelectGame={() => {}}
        onUninstall={(gameId) =>
          setEntries((current) => current.filter((entry) => entry.gameId !== gameId))
        }
      />
    );
  }

  function libraryRow() {
    const rail = screen.getByRole('complementary', { name: 'Library games' });
    return within(rail).getByRole('button', { name: /Diablo/ });
  }

  it('opens a Steam-style menu on right-click of a row and the hero, and via the options button', async () => {
    const user = userEvent.setup();
    render(<LibraryHarness />);

    // Right-click a sidebar row: menu at the cursor with focus inside.
    fireEvent.contextMenu(libraryRow());
    expect(screen.getByRole('menu', { name: 'Diablo actions' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Properties…' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Uninstall' })).toBeVisible();

    // Escape dismisses it.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Right-click the detail hero: same menu.
    fireEvent.contextMenu(document.querySelector('.game-hero') as HTMLElement);
    expect(screen.getByRole('menu', { name: 'Diablo actions' })).toBeVisible();

    // An outside click dismisses it.
    await user.click(screen.getByRole('heading', { name: 'Diablo', level: 2 }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // The action-bar gear opens the same menu for pointer/keyboard users.
    const options = screen.getByRole('button', { name: 'Diablo options' });
    await user.click(options);
    expect(screen.getByRole('menu', { name: 'Diablo actions' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Properties…' })).toHaveFocus();
    // Linking an original copy lives here rather than in the action bar: most
    // of these builds ask for game data themselves on first run, so a
    // permanent Set up button beside PLAY was noise on every game.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Link original copy…' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Uninstall' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(options).toHaveFocus();
  });

  it('uninstalls after a danger-styled confirm and lands on the empty library', async () => {
    const user = userEvent.setup();
    render(<LibraryHarness />);

    fireEvent.contextMenu(libraryRow());
    await user.click(screen.getByRole('menuitem', { name: 'Uninstall' }));

    const dialog = screen.getByRole('dialog', { name: 'Uninstall Diablo?' });
    expect(dialog).toHaveTextContent(
      'This removes it from your library; you can download it again from the Store.',
    );

    // Cancel keeps the game.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(libraryRow()).toBeVisible();

    // Confirm removes the last game: the empty-library state takes over.
    fireEvent.contextMenu(libraryRow());
    await user.click(screen.getByRole('menuitem', { name: 'Uninstall' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Uninstall Diablo?' })).getByRole(
        'button',
        { name: 'Uninstall' },
      ),
    );

    expect(await screen.findByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Browse the Store' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('summarizes and links out instead of duplicating the info panel', async () => {
    const user = userEvent.setup();
    const project = makeProject({
      gameId: 'devilutionx',
      projectName: 'DevilutionX',
      latestVersion: 'v1.5.4',
      downloadAssets: [
        {
          name: 'devilutionx-linux-x86_64.AppImage',
          url: 'https://example.com/devilutionx.AppImage',
          sizeBytes: 38 * 1024 * 1024,
        },
      ],
    });
    render(<LibraryHarness trackedProjects={[project]} />);

    const options = screen.getByRole('button', { name: 'Diablo options' });
    await user.click(options);
    await user.click(screen.getByRole('menuitem', { name: 'Properties…' }));

    const dialog = screen.getByRole('dialog', { name: 'Diablo — Properties' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // One summary line, not a row-for-row copy of the Game Information panel.
    expect(within(dialog).getByText('Summary')).toBeVisible();
    expect(
      within(dialog).getByText(`Installed · Version ${devilutionx.version} · ${devilutionx.runtime} · 1.5 h played`),
    ).toBeVisible();
    expect(within(dialog).getByText('Installed at /games/devilutionx')).toBeVisible();
    expect(within(dialog).queryByText('Install path')).not.toBeInTheDocument();

    // Links carry the detail: upstream plus the store implementation.
    expect(
      within(dialog).getByRole('link', { name: 'Upstream project' }),
    ).toHaveAttribute('href', devilutionx.upstreamUrl);
    expect(
      within(dialog).getByRole('link', { name: 'DevilutionX repository' }),
    ).toHaveAttribute('href', project.repositoryUrl);
    expect(
      within(dialog).getByText(/v1\.5\.4 · devilutionx-linux-x86_64\.AppImage · 38 MB/),
    ).toBeVisible();

    const dialogControls = within(dialog).getAllByRole('button');
    const dialogLinks = within(dialog).getAllByRole('link');
    dialogLinks.at(-1)?.focus();
    await user.tab();
    expect(dialogControls[0]).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(options).toHaveFocus();
  });

  it('omits the repository link when the game has no tracked project', async () => {
    const user = userEvent.setup();
    render(<LibraryHarness />);

    fireEvent.contextMenu(libraryRow());
    await user.click(screen.getByRole('menuitem', { name: 'Properties…' }));

    const dialog = screen.getByRole('dialog', { name: 'Diablo — Properties' });
    expect(within(dialog).getByText('Summary')).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Upstream project' })).toBeVisible();
    expect(
      within(dialog).queryByRole('link', { name: /repository/ }),
    ).not.toBeInTheDocument();
  });
});
