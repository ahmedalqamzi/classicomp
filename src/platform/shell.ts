// Desktop-shell escape hatch. Present only under Electron (see
// electron/preload.cjs); in the browser build and under test it is absent, so
// every caller has to handle "no shell" rather than assume a desktop.
export interface LaunchOptions {
  prerequisite: unknown;
  romPath: string | null;
}

interface ShellResult {
  ok: boolean;
  reason?: string;
  launch?: string;
}

interface ClassicompShell {
  platform: 'linux' | 'win32' | 'darwin';
  arch: string;
  hasWine(): Promise<boolean>;
  pickFile(accepts?: string): Promise<string | null>;
  installBuild(gameId: string, fileName: string): Promise<ShellResult>;
  launchBuild(target: string, options?: LaunchOptions): Promise<ShellResult>;
  runSetup(gameId: string, prerequisite: unknown, romPath: string): Promise<ShellResult>;
  uninstallBuild(gameId: string, launchTarget: string | null): Promise<ShellResult>;
}

declare global {
  interface Window {
    classicompShell?: ClassicompShell;
  }
}

export function desktopShell(): ClassicompShell | null {
  return typeof window !== 'undefined' && window.classicompShell
    ? window.classicompShell
    : null;
}

const NO_SHELL = 'Installing and launching only work in the desktop app.';

// Unpacks the downloaded artifact and resolves it to something runnable — an
// executable path, or a flatpak app id. The heavy lifting is in the main
// process (electron/install.cjs); this is only the call.
export async function installDownloadedBuild(
  gameId: string,
  fileName: string,
): Promise<{ ok: true; launch: string } | { ok: false; reason: string }> {
  const shell = desktopShell();
  if (shell === null) return { ok: false, reason: NO_SHELL };
  const result = await shell.installBuild(gameId, fileName);
  return result.ok && result.launch
    ? { ok: true, launch: result.launch }
    : { ok: false, reason: result.reason ?? 'The install did not produce anything runnable.' };
}

// Runs an installed build detached, so closing Classicomp does not kill it.
export async function runInstalledBuild(
  launchTarget: string,
  options?: LaunchOptions,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const shell = desktopShell();
  if (shell === null) return { ok: false, reason: NO_SHELL };
  const result = await shell.launchBuild(launchTarget, options);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'The build would not start.' };
}

// Removes what installing created. Best effort by design: the library row is
// dropped either way, because a player who asked to uninstall should not be
// left with the entry still there because a directory was busy.
export async function removeInstalledBuild(
  gameId: string,
  launchTarget: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const shell = desktopShell();
  if (shell === null) return { ok: true };
  const result = await shell.uninstallBuild(gameId, launchTarget);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'Could not remove the files.' };
}

// Whether Windows builds are playable on this machine. Resolved once at
// startup and cached, because asset picking runs on every render and cannot
// await anything.
let wineAvailable = false;

export function wineIsAvailable(): boolean {
  return wineAvailable;
}

export async function probeWine(): Promise<void> {
  const shell = desktopShell();
  wineAvailable = shell === null ? false : await shell.hasWine().catch(() => false);
}

// Opens the desktop's own file chooser and returns an absolute path, which is
// the only form any of this is useful in. Null means the player cancelled, or
// there is no desktop shell to ask.
export async function pickOriginalCopy(accepts?: string): Promise<string | null> {
  const shell = desktopShell();
  return shell === null ? null : shell.pickFile(accepts);
}

// Runs a build's own setup tool over the linked disc image. Long-running by
// nature, so callers show a waiting state rather than blocking on Play.
export async function runGameSetup(
  gameId: string,
  prerequisite: unknown,
  romPath: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const shell = desktopShell();
  if (shell === null) return { ok: false, reason: NO_SHELL };
  const result = await shell.runSetup(gameId, prerequisite, romPath);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'Setup failed.' };
}
