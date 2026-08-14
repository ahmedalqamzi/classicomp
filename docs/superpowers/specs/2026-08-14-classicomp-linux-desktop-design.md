# Classicomp Linux Desktop MVP Design

**Date:** 2026-08-14
**Status:** Approved for implementation
**Platform order:** Linux, then macOS, then Windows

## Product goal

Classicomp is a desktop-first game library and launcher for curated classic-game source ports, decompilations, recompilations, and compatible reimplementations. It should be immediately legible to a Steam user while differentiating itself through trustworthy installation metadata and conflict-safe save history.

The MVP is a real Linux desktop application. It does not pretend that a remote cloud service exists when no server has been configured.

## MVP scope

The first runnable application includes:

- A Tauri 2 Linux desktop shell using the system WebKit renderer.
- A dense Steam-like library sidebar and artwork-led game detail page.
- Library, Catalog, and Downloads routes in one persistent application shell.
- Multiple local user profiles with an active-profile switcher.
- A SQLite database stored in the application data directory.
- Persistent games, per-user library membership, downloads, and save-snapshot metadata.
- A local browser-storage adapter used only for web preview and automated UI tests.
- Honest cloud status: `Local only` until a remote provider is configured.
- A save-history panel that exposes device, timestamp, snapshot state, and recovery intent.
- Keyboard-visible focus states and reduced-motion support.

The MVP does not include payments, friends/chat, achievements, a workshop, streaming, or a production remote-sync service.

## Design direction

Classicomp uses Steam's information hierarchy without copying its branding:

- The top bar is 48 pixels high and prioritizes Library, Catalog, and Downloads.
- The left library rail is dense, fixed-width, searchable, and always visible on desktop.
- Game artwork controls the selected page's identity.
- The Play or Install action is the strongest control and sits in a horizontal utility rail.
- The lower detail area favors installation provenance, verification, device saves, and recovery rather than social activity.
- The bottom status strip surfaces downloads and disk availability.

The interface uses flat surfaces, 1-pixel dividers, square or 2-pixel corners, IBM Plex Sans, restrained green for ready actions, blue for neutral sync information, and amber for attention. It avoids floating cards, excessive pills, glass effects, decorative gradients, large empty hero copy, and fake metrics.

## Core workflows

### Launch a library game

1. The user selects an installed game in the left rail.
2. The detail page shows installed version, runtime, install path, and save status.
3. The user selects Play.
4. During the MVP, games without an executable configuration show a clear `Launch target not configured` message. The UI never reports a process launch that did not happen.

### Install from the catalog

1. The user opens Catalog and chooses a curated title.
2. The title enters the download queue with a visible state.
3. The MVP persists that queue state. Network retrieval and transactional installation are a subsequent implementation slice because each port needs a verified upstream manifest and install recipe.

### Switch users

1. The user opens the profile switcher.
2. Selecting a profile changes the active library and save history.
3. The selected profile is persisted in SQLite and restored at next launch.

### Inspect cloud saves

1. The user opens Saves from a game detail action.
2. Classicomp shows the most recent local snapshot, device name, timestamp, and history.
3. With no provider configured, the status reads `Local only` and offers provider setup without claiming upload success.
4. Future remote conflicts will preserve both versions and require an explicit resolution.

## Data model

SQLite contains:

- `profiles(id, display_name, avatar_initials, is_active)`
- `games(id, title, summary, artwork_url, icon_url, runtime, version, executable_path)`
- `user_library(profile_id, game_id, install_state, install_path, play_minutes)`
- `downloads(id, profile_id, game_id, state, progress, bytes_per_second, eta_seconds)`
- `save_snapshots(id, profile_id, game_id, device_name, created_at, state, local_path)`
- `app_settings(key, value)`

The frontend consumes an `AppState` projection rather than issuing SQL. Rust owns schema creation and persistence. The browser preview adapter mirrors this contract using `localStorage`.

## Architecture

- React 19 and TypeScript render the application and own ephemeral UI state.
- Pure domain reducers and selectors model route, selected game, active profile, queued downloads, and save status.
- A platform bridge exposes `loadState`, `setActiveProfile`, and `queueInstall`.
- In Tauri, the bridge invokes Rust commands backed by SQLite.
- In a browser, the bridge uses local storage with the same response shapes.
- Tauri capabilities expose only the commands the application needs.

## Reliability and trust rules

- Never claim a game is installed unless its database state says installed.
- Never claim a cloud upload completed without a configured remote provider response.
- Never delete a save snapshot during conflict resolution; preserve both versions until the user chooses.
- Never add or change an FPS limiter.
- Keep proprietary game assets out of the repository. Remote artwork is attributed to upstream projects and must have a safe fallback.
- Database migrations are idempotent and covered by tests against a temporary real SQLite database.

## Acceptance criteria

- `npm test` passes the domain and React interaction suite.
- `npm run build` produces the Vite frontend without warnings or type errors.
- `cargo test --manifest-path src-tauri/Cargo.toml` passes against temporary SQLite databases.
- `npm run tauri build -- --debug --no-bundle` produces a Linux executable.
- The launched application shows working Library, Catalog, and Downloads navigation.
- Changing the active profile persists after restarting the app.
- The rendered 1440 by 900 interface has no clipped primary controls or browser console errors.
- Cloud status remains explicitly local-only until a remote provider exists.

