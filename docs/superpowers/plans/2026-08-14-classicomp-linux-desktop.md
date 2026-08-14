# Classicomp Linux Desktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Linux-first Classicomp desktop client with a Steam-like library interface and persistent multi-user library, download, and save metadata.

**Architecture:** React renders a dense desktop application shell and talks through a small platform bridge. The Tauri implementation invokes Rust commands backed by SQLite, while browser previews and UI tests use a contract-compatible local-storage adapter.

**Tech Stack:** Tauri 2.11, Rust 1.97, rusqlite 0.40, React 19.2, TypeScript 7, Vite 8, Vitest 4, Testing Library 16

## Global Constraints

- Linux is the first supported runtime; macOS and Windows remain future targets from the same Tauri codebase.
- Remote sync must display `Local only` until a real provider is configured.
- Never add or change an FPS limiter.
- Do not bundle proprietary game assets.
- Use flat desktop surfaces, 1-pixel dividers, 2-pixel maximum corner radius, and no decorative glass or glow effects.
- All persistent writes go through the platform bridge; React components do not issue SQL or access Tauri APIs directly.

---

### Task 1: Frontend foundation and domain state

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/domain/types.ts`
- Create: `src/domain/state.ts`
- Create: `src/domain/state.test.ts`
- Create: `src/data/seed.ts`

**Interfaces:**
- Produces: `AppState`, `Game`, `Profile`, `Download`, `SaveSnapshot`, `selectVisibleLibrary(state)`, `selectGame(state, gameId)`, and `reduceAppState(state, action)`.

- [ ] **Step 1: Write the failing domain test**

```ts
it('switches profile and selects the first game in that profile library', () => {
  const next = reduceAppState(seedState, { type: 'profile/activate', profileId: 'mira' });
  expect(next.activeProfileId).toBe('mira');
  expect(next.selectedGameId).toBe('openrct2');
});
```

- [ ] **Step 2: Run `npm test -- src/domain/state.test.ts` and verify failure because `reduceAppState` does not exist**
- [ ] **Step 3: Implement the typed state model, literal seed data, selectors, and minimal reducer branches for route, selection, profile activation, and install queueing**
- [ ] **Step 4: Run `npm test -- src/domain/state.test.ts` and verify all domain tests pass**

### Task 2: Platform persistence bridge

**Files:**
- Create: `src/platform/bridge.ts`
- Create: `src/platform/browser-store.ts`
- Create: `src/platform/browser-store.test.ts`

**Interfaces:**
- Consumes: `AppState` from `src/domain/types.ts` and `seedState` from `src/data/seed.ts`.
- Produces: `PlatformBridge` with `loadState(): Promise<AppState>`, `setActiveProfile(profileId: string): Promise<AppState>`, and `queueInstall(gameId: string): Promise<AppState>`.

- [ ] **Step 1: Write a failing test using a real in-memory `Storage` implementation**

```ts
it('restores the active profile from persisted browser state', async () => {
  const bridge = createBrowserBridge(memoryStorage);
  await bridge.setActiveProfile('mira');
  expect((await bridge.loadState()).activeProfileId).toBe('mira');
});
```

- [ ] **Step 2: Run `npm test -- src/platform/browser-store.test.ts` and verify failure because `createBrowserBridge` does not exist**
- [ ] **Step 3: Implement the browser adapter and runtime bridge selection**
- [ ] **Step 4: Run the platform test and the full frontend suite**

### Task 3: Accessible application workflows

**Files:**
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/main.tsx`
- Create: `src/components/AppHeader.tsx`
- Create: `src/components/LibrarySidebar.tsx`
- Create: `src/components/GameDetail.tsx`
- Create: `src/components/CatalogView.tsx`
- Create: `src/components/DownloadsView.tsx`
- Create: `src/components/ProfileMenu.tsx`
- Create: `src/components/StatusStrip.tsx`

**Interfaces:**
- Consumes: `PlatformBridge` and domain selectors.
- Produces: `App({ bridge?: PlatformBridge })` with accessible navigation, profile switching, game selection, and install queue interaction.

- [ ] **Step 1: Write failing interaction tests**

```tsx
it('moves a catalog game into Downloads', async () => {
  render(<App bridge={createBrowserBridge(memoryStorage)} />);
  await user.click(await screen.findByRole('tab', { name: 'Catalog' }));
  await user.click(screen.getByRole('button', { name: 'Install DevilutionX' }));
  await user.click(screen.getByRole('tab', { name: /Downloads/ }));
  expect(screen.getByText('DevilutionX')).toBeVisible();
});
```

- [ ] **Step 2: Run `npm test -- src/App.test.tsx` and verify the test fails because the application shell does not exist**
- [ ] **Step 3: Implement the application and focused components with semantic buttons, tabs, navigation, headings, and live status text**
- [ ] **Step 4: Run the App test and full frontend suite**

### Task 4: Steam-like visual system

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/app.css`
- Create: `src/styles/responsive.css`

**Interfaces:**
- Consumes: semantic class names from Task 3.
- Produces: the approved 48-pixel header, 260-pixel library rail, artwork hero, action rail, detail columns, download view, status strip, keyboard focus, and reduced-motion treatment.

- [ ] **Step 1: Add a UI test asserting the primary shell landmarks remain present at startup**
- [ ] **Step 2: Run the test and verify it fails for the missing status landmark**
- [ ] **Step 3: Implement the flat visual system and responsive minimum-size layout**
- [ ] **Step 4: Run `npm test` and `npm run build`**

### Task 5: SQLite repository and Tauri commands

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/database.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: `Database::open(path)`, `Database::load_state()`, `Database::set_active_profile(id)`, `Database::queue_install(game_id)`, and Tauri commands with matching camelCase JSON projections.

- [ ] **Step 1: Write failing Rust tests in `database.rs` using `tempfile::tempdir()` and a real SQLite file**

```rust
#[test]
fn active_profile_survives_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("classicomp.db");
    Database::open(&path).unwrap().set_active_profile("mira").unwrap();
    assert_eq!(Database::open(&path).unwrap().load_state().unwrap().active_profile_id, "mira");
}
```

- [ ] **Step 2: Run `cargo test --manifest-path src-tauri/Cargo.toml` and verify failure because `Database` is not implemented**
- [ ] **Step 3: Implement idempotent schema initialization, seed rows, projections, update transactions, and three Tauri commands**
- [ ] **Step 4: Run the Rust tests and confirm the real database survives reopen**

### Task 6: Native integration and visual verification

**Files:**
- Modify: `src/platform/bridge.ts`
- Modify: `README.md`
- Create: `src-tauri/icons/icon.png`

**Interfaces:**
- Consumes: Rust commands from Task 5.
- Produces: a native Linux application executable and documented development commands.

- [ ] **Step 1: Add a failing bridge-selection test for a present `window.__TAURI_INTERNALS__` runtime**
- [ ] **Step 2: Run the test and verify the browser adapter is incorrectly selected**
- [ ] **Step 3: Implement dynamic Tauri invocation, app metadata, icon assets, and README run/build instructions**
- [ ] **Step 4: Run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`**
- [ ] **Step 5: Run `npm run tauri build -- --debug --no-bundle` and verify the executable exists**
- [ ] **Step 6: Launch the executable, capture 1440 by 900 and 1100 by 680 screenshots, inspect them visually, and correct clipping or hierarchy defects**

## Self-review

- Every MVP requirement in the design spec maps to Tasks 1 through 6.
- Remote transport, verified game downloads, payments, social features, achievements, workshop, and streaming remain outside this MVP.
- The platform bridge method names and `AppState` projection are consistent across frontend, browser adapter, Rust models, and tests.
- No task contains a product-code placeholder; deferred features are excluded explicitly rather than represented by empty implementations.

