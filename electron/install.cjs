// Turning a downloaded release into something runnable.
//
// A "download" from this store is a release artifact, not a game: it is a zip,
// a tarball, an AppImage, or a Flatpak bundle. Play could never work straight
// off that file — unzipping a Flatpak bundle into a folder and handing it to
// the desktop opener just opens an archive manager. So installing is a real
// step with real work: unpack, identify what kind of thing came out, and
// register it with whatever runtime owns it.
//
// Everything lands under the app's own data dir, one folder per game, so an
// uninstall is a directory removal and nothing leaks into the user's system
// except the Flatpak registration (which Flatpak itself owns).
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const EXEC_BIT = 0o111;
const ARCHIVE_PATTERN = /\.(zip|tar\.(gz|xz|bz2|zst)|tgz|txz|tbz2?)$/i;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 32 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? error?.message ?? '') });
    });
  });
}

// Wine turns a Windows-only release into something playable rather than
// something declined. Probed once: the answer cannot change while the app runs.
let wineChecked = null;
async function hasWine() {
  if (wineChecked === null) wineChecked = (await run('wine', ['--version'])).ok;
  return wineChecked;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// Unpack by extension, trying each extractor the platform actually has.
// Windows 10+ ships bsdtar as tar.exe, which reads zips as well as tarballs,
// with PowerShell's Expand-Archive as the fallback for older builds; on Unix
// unzip is preferred for zips and GNU tar handles the rest.
async function unpack(archive, dest, preferredName) {
  const lower = archive.toLowerCase();
  const isZip = lower.endsWith('.zip');
  const isTarball = /\.(tar\.(gz|xz|bz2|zst)|tgz|txz|tbz2?)$/.test(lower);

  if (!isZip && !isTarball) {
    // Not an archive: the artifact itself is the payload (AppImage, .exe, raw
    // binary). Copy rather than move so a failed install leaves the download
    // intact and retryable — and under the name the release actually used,
    // not whatever the browser renamed it to. A payload left as ".txt" would
    // be filtered out as a data file and the install would find nothing.
    const target = path.join(dest, preferredName ?? path.basename(archive));
    await fs.copyFile(archive, target);
    return { ok: true };
  }

  // Try every extractor that could plausibly be present, best first, rather
  // than assuming one per platform: `tar` is bsdtar on Windows and macOS (so
  // it reads zips) but GNU tar on Linux (so it does not), and that difference
  // is not worth encoding as a guess when simply trying the next tool is
  // both simpler and more robust on stripped-down systems.
  const attempts = isZip
    ? [
        ['unzip', ['-o', '-q', archive, '-d', dest]],
        ['bsdtar', ['-xf', archive, '-C', dest]],
        ['tar', ['-xf', archive, '-C', dest]],
        [
          'powershell',
          ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dest}' -Force`],
        ],
      ]
    : [
        ['tar', ['-xf', archive, '-C', dest]],
        ['bsdtar', ['-xf', archive, '-C', dest]],
      ];

  let lastError = 'no extractor available';
  for (const [command, args] of attempts) {
    const result = await run(command, args);
    if (result.ok) return { ok: true };
    lastError = result.stderr || lastError;
  }
  return { ok: false, reason: lastError };
}

// A Flatpak bundle is not a file you run — it has to be registered with the
// user's Flatpak installation first, and afterwards it is launched by app id,
// never by path.
async function installFlatpakBundle(bundle) {
  const probe = await run('flatpak', ['--version']);
  if (!probe.ok) {
    return { ok: false, reason: 'This build ships as a Flatpak, but Flatpak is not installed.' };
  }
  // Ask the bundle what it is rather than inferring from its file name. Some
  // are named for the app id (io.github.zelda64recomp.zelda64recomp.flatpak)
  // and some are not (SnowboardKids2Recompiled-Flatpak-X64-Release.flatpak),
  // and guessing wrong means installing a game and then being unable to
  // launch it.
  const declared = await run('flatpak', ['info', '--show-ref', bundle]);
  const fromBundle = declared.ok ? declared.stdout.trim().split('/')[1] : null;

  const listIds = async () => {
    const list = await run('flatpak', ['list', '--user', '--columns=application']);
    return list.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  };
  const before = new Set(await listIds());

  const result = await run(
    'flatpak',
    ['install', '--user', '--noninteractive', '--assumeyes', bundle],
    { timeout: 15 * 60 * 1000 },
  );

  const installed = await listIds();
  // Prefer what the bundle declared; otherwise whatever is newly present;
  // otherwise the file name, which is right often enough to be worth trying.
  const guess = path.basename(bundle).replace(/\.flatpak$/i, '');
  const appeared = installed.find((id) => !before.has(id));
  const appId =
    (fromBundle && installed.includes(fromBundle) ? fromBundle : null) ??
    appeared ??
    (installed.includes(guess) ? guess : null) ??
    fromBundle;

  // Flatpak exits non-zero on "already installed", which is the normal result
  // of reinstalling or repairing. The question that actually matters is
  // whether the app is registered now, so answer that instead of trusting the
  // exit code.
  if (appId) return { ok: true, launch: `flatpak:${appId}` };
  if (!result.ok) {
    return { ok: false, reason: `Flatpak refused the bundle: ${result.stderr.trim().slice(0, 300)}` };
  }
  return { ok: false, reason: 'Flatpak reported success but registered no application.' };
}

// Reads the file's magic number rather than trusting its name, because the
// portable Linux builds in this catalogue routinely ship with no extension at
// all (CrashBandicoot-Linux) while data files happily carry misleading ones.
async function binaryKind(file) {
  try {
    const handle = await fs.open(file, 'r');
    const buffer = Buffer.alloc(4);
    await handle.read(buffer, 0, 4, 0);
    await handle.close();
    if (buffer[0] === 0x7f && buffer.subarray(1, 4).toString('latin1') === 'ELF') return 'elf';
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) return 'pe';
    const header = buffer.readUInt32BE(0);
    // Mach-O, both endiannesses, plus the universal ("fat") wrapper.
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(header)) return 'macho';
    return null;
  } catch {
    return null;
  }
}

// Never data, never a library, and on Windows never the uninstaller.
const NON_PROGRAM =
  /\.(so(\.\d+)*|dll|dylib|a|jar|txt|md|json|png|jpg|jpeg|svg|desktop|xml|ico|cfg|ini|dat|pak|wad|ttf|otf|log|html?|rml|bps)$/i;
const NOT_THE_GAME = /(^|[\\/])(unins|uninstall|setup|vcredist|crashpad|crashreport|updater)/i;

// Ranked because an extracted release routinely contains several runnable
// files (editors, helpers, crash handlers). A platform-native bundle is
// unambiguous; after that the biggest native binary is the game far more often
// than not — OpenMW ships openmw.x86_64 at 57MB beside openmw-cs.x86_64 at
// 14MB, and the larger one is the game.
async function pickExecutable(root) {
  const files = await walk(root);
  const wanted = process.platform === 'win32' ? 'pe' : process.platform === 'darwin' ? 'macho' : 'elf';

  if (process.platform === 'linux') {
    const appImage = files.find((file) => /\.appimage$/i.test(file));
    if (appImage) {
      await fs.chmod(appImage, 0o755).catch(() => {});
      return appImage;
    }
  }
  if (process.platform === 'darwin') {
    // A .app is a directory; its executable lives in Contents/MacOS.
    const inBundle = files.find((file) => /\.app\/Contents\/MacOS\//.test(file));
    if (inBundle) {
      await fs.chmod(inBundle, 0o755).catch(() => {});
      return inBundle;
    }
  }

  // Two tiers, because "has the executable bit" is far too generous a test on
  // Unix: REDRIVER2 ships a 4MB jpsxdec.jar marked executable alongside the
  // actual game binary, and picking by size alone hands the player a Java
  // tool. A real native binary always beats a script or a jar; only when
  // there is no native binary at all does an executable file get considered.
  const native = [];
  const fallback = [];
  for (const file of files) {
    if (NON_PROGRAM.test(file) || NOT_THE_GAME.test(file)) continue;
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) continue;
    const kind = await binaryKind(file);
    if (kind === wanted) native.push({ file, size: stat.size });
    else if (process.platform !== 'win32' && kind === null && (stat.mode & EXEC_BIT) !== 0) {
      fallback.push({ file, size: stat.size });
    }
  }
  const candidates = native.length > 0 ? native : fallback;
  if (candidates.length > 0) {
    candidates.sort((left, right) => right.size - left.size);
    if (process.platform !== 'win32') await fs.chmod(candidates[0].file, 0o755).catch(() => {});
    return candidates[0].file;
  }

  // Nothing native. A Windows build is still playable here through Wine, and
  // eight games in this catalogue ship nothing else — declining them outright
  // was a choice, not a limit.
  if (process.platform !== 'win32' && (await hasWine())) {
    const windows = [];
    for (const file of files) {
      if (NON_PROGRAM.test(file) || NOT_THE_GAME.test(file)) continue;
      if ((await binaryKind(file)) !== 'pe') continue;
      const stat = await fs.stat(file).catch(() => null);
      if (stat) windows.push({ file, size: stat.size });
    }
    if (windows.length > 0) {
      windows.sort((left, right) => right.size - left.size);
      return `wine:${windows[0].file}`;
    }
  }
  return null;
}

// When nothing runnable turned up, the payload itself says why: a pile of PE
// binaries means the release is Windows-only, and no binaries at all means it
// ships assets or source. Saying "build it from source" to someone holding a
// Windows build is just wrong, and they cannot act on it.
async function explainNothingRunnable(root) {
  const kinds = new Set();
  for (const file of await walk(root)) {
    const kind = await binaryKind(file);
    if (kind) kinds.add(kind);
  }
  const names = { elf: 'Linux', pe: 'Windows', macho: 'macOS' };
  const here = process.platform === 'win32' ? 'pe' : process.platform === 'darwin' ? 'macho' : 'elf';
  const foreign = [...kinds].filter((kind) => kind !== here);
  if (foreign.length > 0) {
    const which = foreign.map((kind) => names[kind]).join(' and ');
    if (foreign.includes('pe') && process.platform !== 'win32') {
      return `This release only ships a Windows build, and Wine is not installed. Install Wine and reinstall to play it.`;
    }
    return `This release only ships a ${which} build, which cannot run here.`;
  }
  return 'Unpacked, but no runnable program was found inside — this release ships assets or source only, and needs building.';
}

// Anything here belongs to the player, not the release. Updating a game must
// never cost someone their progress, and installing wipes the directory before
// unpacking — so these are lifted out first and put back afterwards.
// Deliberately broad on saves (losing one is unrecoverable) and narrower on
// config (a stale settings file is merely annoying, and the player's own
// keybinds are worth keeping).
const SAVE_DIR = /^(saves?|save[_-]?data|savedata|userdata|user|profiles?|screenshots|mods)$/i;
const SAVE_FILE = /\.(sav|srm|sra|eep|fla|mpk|dsv|state\d*|st\d+|ss\d+|bin\.bak)$/i;
const CONFIG_FILE = /^[^/]*\.(ini|cfg|toml|yaml|yml)$|(^|[/\\])(config|settings)\.json$/i;

async function collectPlayerData(root) {
  const keep = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return keep;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SAVE_DIR.test(entry.name)) keep.push(full);
      else keep.push(...(await collectPlayerData(full)));
    } else if (SAVE_FILE.test(entry.name) || CONFIG_FILE.test(entry.name)) {
      keep.push(full);
    }
  }
  return keep;
}

// Moves player data aside, returning a restore function. The staging area sits
// next to the game directory rather than inside it, so the wipe cannot reach
// it, and it is removed once the data is back.
async function stashPlayerData(gameDir) {
  const found = await collectPlayerData(gameDir);
  if (found.length === 0) return async () => {};
  const stash = `${gameDir}.userdata-${Date.now()}`;
  for (const source of found) {
    const target = path.join(stash, path.relative(gameDir, source));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true }).catch(() => {});
  }
  return async () => {
    // The player's copy wins: a fresh build ships default saves and configs,
    // and restoring over them is the entire point.
    await fs.cp(stash, gameDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(stash, { recursive: true, force: true }).catch(() => {});
  };
}

// ── Runtime provisioning ────────────────────────────────────────────────────
//
// Several builds here are .NET applications that ship without a runtime, so
// they die on start with "You must install .NET". Telling the player to sudo a
// package manager is not an answer: this is a storefront, and making the game
// runnable is its job. .NET installs perfectly well per-user, so Classicomp
// provisions it into its own data directory and points the game at it through
// DOTNET_ROOT. Nothing is installed system-wide, nothing needs root, and
// removing Classicomp removes the runtime with it.

// The build states its own requirement in <app>.runtimeconfig.json; reading it
// beats guessing a version.
async function requiredDotnetMajor(root) {
  for (const file of await walk(root)) {
    if (!/\.runtimeconfig\.json$/i.test(file)) continue;
    try {
      const config = JSON.parse(await fs.readFile(file, 'utf8'));
      const options = config?.runtimeOptions ?? {};
      const frameworks = options.framework ? [options.framework] : (options.frameworks ?? []);
      const core = frameworks.find((entry) => entry?.name === 'Microsoft.NETCore.App');
      const major = Number.parseInt(String(core?.version ?? '').split('.')[0], 10);
      if (Number.isFinite(major)) return major;
    } catch {
      // A malformed config tells us nothing; keep looking.
    }
  }
  return null;
}

async function dotnetInstalled(dotnetRoot, major) {
  const shared = path.join(dotnetRoot, 'shared', 'Microsoft.NETCore.App');
  const versions = await fs.readdir(shared).catch(() => []);
  return versions.some((version) => version.startsWith(`${major}.`));
}

// Microsoft's own installer script, run with --install-dir so it never touches
// anything outside our data directory, and --no-path so it never edits the
// player's shell profile.
async function provisionDotnet(runtimesDir, major) {
  const dotnetRoot = path.join(runtimesDir, 'dotnet');
  if (await dotnetInstalled(dotnetRoot, major)) return { ok: true, dotnetRoot };

  await fs.mkdir(runtimesDir, { recursive: true });
  const windows = process.platform === 'win32';
  const script = path.join(runtimesDir, windows ? 'dotnet-install.ps1' : 'dotnet-install.sh');
  const url = windows ? 'https://dot.net/v1/dotnet-install.ps1' : 'https://dot.net/v1/dotnet-install.sh';

  const fetched = windows
    ? await run('powershell', ['-NoProfile', '-Command', `Invoke-WebRequest -Uri ${url} -OutFile '${script}'`], { timeout: 120000 })
    : await run('curl', ['-sSL', '--max-time', '120', '-o', script, url], { timeout: 130000 });
  if (!fetched.ok) {
    return { ok: false, reason: 'Could not reach Microsoft to fetch the .NET runtime. Check your connection and try again.' };
  }

  const args = windows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Channel', `${major}.0`, '-Runtime', 'dotnet', '-InstallDir', dotnetRoot, '-NoPath']
    : [script, '--channel', `${major}.0`, '--runtime', 'dotnet', '--install-dir', dotnetRoot, '--no-path'];
  const installed = await run(windows ? 'powershell' : 'bash', args, { timeout: 20 * 60 * 1000 });
  if (!installed.ok || !(await dotnetInstalled(dotnetRoot, major))) {
    return { ok: false, reason: `Could not install the .NET ${major} runtime: ${installed.stderr.trim().slice(0, 200)}` };
  }
  return { ok: true, dotnetRoot };
}

// Everything a game needs to run that did not come in its own download.
// Returns the environment additions its launch needs.
async function ensureRuntimes(gameDir, runtimesDir) {
  const major = await requiredDotnetMajor(gameDir);
  if (major === null || !runtimesDir) return { ok: true, env: {} };
  const result = await provisionDotnet(runtimesDir, major);
  if (!result.ok) return result;
  return {
    ok: true,
    env: {
      DOTNET_ROOT: result.dotnetRoot,
      // The apphost consults the architecture-specific variable first on x64.
      DOTNET_ROOT_X64: result.dotnetRoot,
      PATH: `${result.dotnetRoot}${path.delimiter}${process.env.PATH ?? ''}`,
    },
  };
}

// Browsers rename downloads. Chromium appends .txt to extensionless files
// (fixed at the source, but old downloads persist), and adds " (1)" when a
// name is taken; the >200MB path hands the transfer to the browser entirely,
// where the app never controls the name at all. Rather than fail with "no
// longer in your downloads" over a renamed file that is sitting right there,
// look for it.
async function resolveArchive(archivePath) {
  if (await exists(archivePath)) return archivePath;
  const dir = path.dirname(archivePath);
  const base = path.basename(archivePath);
  const stem = base.replace(/\.[^.]+$/, '');
  const extension = base.slice(stem.length);

  const entries = await fs.readdir(dir).catch(() => []);
  const candidates = entries.filter(
    (name) =>
      name === `${base}.txt` ||
      // "game (1).zip", "game (2).zip"
      new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+\\)${extension.replace(/\./g, '\\.')}$`).test(name) ||
      name.startsWith(base),
  );
  if (candidates.length === 0) return null;

  // Newest wins: a re-download is the one the player meant.
  const stats = await Promise.all(
    candidates.map(async (name) => ({
      name,
      at: (await fs.stat(path.join(dir, name)).catch(() => null))?.mtimeMs ?? 0,
    })),
  );
  stats.sort((left, right) => right.at - left.at);
  return path.join(dir, stats[0].name);
}

// Returns a launch target: an absolute path, or "flatpak:<app id>".
async function installBuild({ archivePath: requestedArchive, gameDir, runtimesDir }) {
  let archivePath = requestedArchive;
  const resolved = await resolveArchive(archivePath);
  if (resolved === null) {
    return { ok: false, reason: 'That download is no longer in your downloads folder.' };
  }
  archivePath = resolved;
  // Reinstalling and updating both land here, and both wipe the directory.
  // Lift the player's saves and settings out first. (Flatpak builds keep their
  // data in ~/.var/app, which this never touches, so they are safe already.)
  const restorePlayerData = await stashPlayerData(gameDir);
  await fs.rm(gameDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(gameDir, { recursive: true });

  const unpacked = await unpack(archivePath, gameDir, path.basename(requestedArchive));
  if (!unpacked.ok) {
    await restorePlayerData();
    return { ok: false, reason: `Could not unpack the download: ${unpacked.reason}` };
  }

  // Releases nest: Zelda 64 Recompiled ships a zip containing a tar.gz, and
  // its Flatpak variant ships a zip containing a bundle. So keep unwrapping
  // while the layer we are looking at holds nothing runnable. Recursing only
  // on that condition means archives shipped as game *data* are left alone —
  // once an executable is found, nothing further is touched.
  for (let depth = 0; depth < 4; depth += 1) {
    const files = await walk(gameDir);
    const bundle = process.platform === 'linux' && files.find((file) => /\.flatpak$/i.test(file));
    if (bundle) {
      await restorePlayerData();
      return installFlatpakBundle(bundle);
    }

    const executable = await pickExecutable(gameDir);
    if (executable) {
      await restorePlayerData();
      // Provision any runtime the build needs now, while the player is already
      // watching an install, rather than on first Play where it would look
      // like the game hung.
      const runtimes = await ensureRuntimes(gameDir, runtimesDir);
      if (!runtimes.ok) return { ok: false, reason: runtimes.reason };
      return { ok: true, launch: executable };
    }

    const nested = files.filter((file) => ARCHIVE_PATTERN.test(file));
    if (nested.length === 0) break;
    for (const archive of nested) {
      const into = path.join(path.dirname(archive), path.basename(archive).replace(ARCHIVE_PATTERN, ''));
      await fs.mkdir(into, { recursive: true });
      const result = await unpack(archive, into);
      // Remove the wrapper either way: a failed inner unpack must not be
      // rediscovered as "nested" on the next pass and loop forever.
      await fs.rm(archive, { force: true }).catch(() => {});
      if (!result.ok) {
        await restorePlayerData();
        return { ok: false, reason: `Could not unpack ${path.basename(archive)}: ${result.reason}` };
      }
    }
  }

  const reason = await explainNothingRunnable(gameDir);
  await restorePlayerData();
  return { ok: false, reason };
}

// A missing system runtime is the most common reason one of these builds dies
// on start, and the runtime's own message ("You must install .NET…") names the
// problem without saying what to do about it. Where the fix is unambiguous,
// say it — otherwise pass the program's own first line through, since that is
// the only real information anyone has.
function describeEarlyExit(message, code) {
  if (!message) return `The game closed immediately (exit code ${code}).`;
  // Matched on the host's actual phrasing, not a bare "dotnet": paths routinely
  // contain that word, and a game printing one would otherwise be handed
  // advice about a runtime that is working fine.
  if (/you must install \.net|\.net location: not found|framework .*Microsoft\.NETCore\.App.* was not found/i.test(message)) {
    return 'This game needs the .NET runtime and Classicomp could not provide it. Reinstall the game to try provisioning it again.';
  }
  if (/libvulkan|vulkan/i.test(message)) {
    return 'This game needs Vulkan drivers, which are not installed. Install your GPU vendor Vulkan package and try again.';
  }
  if (/error while loading shared libraries: ([^:]+)/i.test(message)) {
    const missing = message.match(/error while loading shared libraries: ([^:]+)/i)[1];
    return `This game needs a system library that is missing: ${missing}. Install it with your package manager and try again.`;
  }
  return `The game closed immediately: ${message.slice(0, 220)}`;
}

// How long to watch a freshly launched game before assuming it is running. A
// real game is still alive after this; one that dies inside it did not start.
const LAUNCH_WATCH_MS = 4000;

// Spawning successfully is not the same as launching successfully. Symphony of
// the Night is a .NET application, and on a machine without the runtime its
// process starts, prints "You must install .NET to run this application" and
// exits 131 — all of which the old fire-and-forget launcher discarded, so Play
// looked like it did nothing at all. So the child is watched briefly: still
// alive means it launched and gets detached; a quick exit means it failed, and
// whatever it printed is the only explanation anyone has.
function spawnWatched(command, args, options) {
  const child = require('node:child_process').spawn(command, args, {
    ...options,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const collect = (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  return new Promise((resolve) => {
    const settle = (result) => {
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      // Alive and presumably showing a window: stop listening and let it go.
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      settle({ ok: true });
    }, LAUNCH_WATCH_MS);

    child.once('error', (error) =>
      settle({ ok: false, reason: `Could not start it: ${String(error.message ?? error)}` }),
    );
    child.once('exit', (code) => {
      const message = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)[0];
      settle({ ok: false, reason: describeEarlyExit(message, code) });
    });
  });
}

// Applying a prerequisite: either hand the file to the game on its command
// line, or put a copy where the game looks for it. Copying rather than
// symlinking because a Wine prefix and a flatpak sandbox both resolve symlinks
// unpredictably, and these files are small next to the builds themselves.
async function applyPrerequisite(gameDir, prerequisite, romPath) {
  if (!prerequisite || !romPath) return { ok: true, args: [] };
  if (!(await exists(romPath))) {
    return { ok: false, reason: `Your linked copy is no longer at ${romPath}. Link it again from the game options.` };
  }
  if (prerequisite.kind === 'argument') {
    return { ok: true, args: [prerequisite.flag, romPath] };
  }
  for (const name of prerequisite.names ?? []) {
    const target = path.join(gameDir, name);
    if (await exists(target)) continue;
    await fs.copyFile(romPath, target).catch(() => {});
  }
  return { ok: true, args: [] };
}

// Runs a build's own setup tool over the linked disc image. Slow by nature —
// OpenGOAL extracts, decompiles and recompiles the entire game — so the
// caller runs this from Set up, where waiting is the expected experience,
// and never from Play.
async function runSetupTool({ gameDir, prerequisite, romPath }) {
  if (!prerequisite || prerequisite.kind !== 'tool') return { ok: true };
  if (!romPath || !(await exists(romPath))) {
    return { ok: false, reason: 'Link your original disc image first.' };
  }
  const files = await walk(gameDir);
  const tool = files.find((file) => path.basename(file) === prerequisite.tool);
  if (!tool) {
    return { ok: false, reason: `This build did not ship its ${prerequisite.tool} tool; reinstall it.` };
  }
  await fs.chmod(tool, 0o755).catch(() => {});

  const args = (prerequisite.args ?? []).map((arg) => arg.replace('{rom}', romPath));
  const result = await run(tool, args, {
    cwd: path.dirname(tool),
    timeout: Math.max(prerequisite.minutes ?? 30, 5) * 60 * 1000,
  });
  if (!result.ok) {
    const line = `${result.stderr}\n${result.stdout}`
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .pop();
    return { ok: false, reason: `Setting up from the disc failed: ${String(line ?? '').slice(0, 200)}` };
  }
  return { ok: true };
}

// Detached so closing Classicomp does not kill the game.
async function launchBuild(target, { runtimesDir, prerequisite, romPath } = {}) {
  if (typeof target !== 'string' || target.length === 0) return { ok: false, reason: 'Nothing to launch.' };
  if (target.startsWith('flatpak:')) {
    // Flatpak carries its own runtime; nothing to provision.
    return spawnWatched('flatpak', ['run', target.slice('flatpak:'.length)], {});
  }
  if (target.startsWith('wine:')) {
    const exe = target.slice('wine:'.length);
    if (!(await exists(exe))) return { ok: false, reason: 'The installed build is missing — install it again.' };
    if (!(await hasWine())) return { ok: false, reason: 'This game runs through Wine, which is not installed.' };
    const wineReady = await applyPrerequisite(path.dirname(exe), prerequisite, romPath);
    if (!wineReady.ok) return wineReady;
    // A prefix per game keeps one game's registry mess out of another's, and
    // out of the player's own ~/.wine.
    return spawnWatched('wine', [exe, ...wineReady.args], {
      cwd: path.dirname(exe),
      env: { ...process.env, WINEPREFIX: path.join(path.dirname(exe), '.wineprefix'), WINEDEBUG: '-all' },
    });
  }
  if (!(await exists(target))) return { ok: false, reason: 'The installed build is missing — install it again.' };
  if (process.platform !== 'win32') await fs.chmod(target, 0o755).catch(() => {});

  const gameDir = path.dirname(target);
  // Also checked here, not only at install time: a library installed before
  // runtime provisioning existed would otherwise never get one.
  const runtimes = await ensureRuntimes(gameDir, runtimesDir);
  if (!runtimes.ok) return { ok: false, reason: runtimes.reason };

  const ready = await applyPrerequisite(gameDir, prerequisite, romPath);
  if (!ready.ok) return ready;

  return spawnWatched(target, ready.args, {
    cwd: gameDir,
    env: { ...process.env, ...runtimes.env },
  });
}

// Removing a game means removing what installing created: the unpacked
// directory, and the Flatpak registration if that is how it was installed.
// Dropping only the library row would leave hundreds of megabytes on disk and
// a Flatpak the player never asked to keep, and "uninstall" would be a lie.
// The downloaded artifact in ~/Downloads is deliberately left alone — it is
// the player's file, and keeping it means reinstalling needs no second
// download.
async function uninstallBuild({ gameDir, launchTarget }) {
  const problems = [];
  if (typeof launchTarget === 'string' && launchTarget.startsWith('flatpak:')) {
    const appId = launchTarget.slice('flatpak:'.length);
    const result = await run('flatpak', ['uninstall', '--user', '--noninteractive', '--assumeyes', appId]);
    // Already gone is the desired end state, not a failure.
    if (!result.ok && !/not installed/i.test(result.stderr)) {
      problems.push(`Flatpak could not remove ${appId}: ${result.stderr.trim().slice(0, 200)}`);
    }
  }
  try {
    await fs.rm(gameDir, { recursive: true, force: true });
  } catch (error) {
    problems.push(`Could not delete ${gameDir}: ${String(error).slice(0, 200)}`);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, reason: problems.join('; ') };
}

module.exports = { installBuild, launchBuild, uninstallBuild, runSetupTool };
