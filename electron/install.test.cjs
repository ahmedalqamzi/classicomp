// Installer tests. These build real archives on disk and run the real
// extractor, because the whole point of this module is behaviour against
// actual release layouts — a mocked fs would test nothing that has ever
// broken. Platform-specific paths are exercised by overriding
// process.platform, which is what the module branches on.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { installBuild, launchBuild } = require('./install.cjs');

const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
const PE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const MACHO = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01]);

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `classicomp-${name}-`));
}

// Writes a file whose first bytes are `magic`, padded to `size` so the
// largest-binary tiebreak can be exercised.
function writeBinary(file, magic, size = 1024) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = Buffer.alloc(Math.max(size, magic.length));
  magic.copy(body, 0);
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
}

// bsdtar rather than the zip command: it writes zips from the same binary
// that reads them, so the fixtures need no tool the extractor does not.
function zip(dir, output) {
  execFileSync('bsdtar', ['-a', '-cf', output, '-C', dir, '.']);
}

function withPlatform(value, body) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value, configurable: true });
  return Promise.resolve()
    .then(body)
    .finally(() => Object.defineProperty(process, 'platform', original));
}

test('linux: a bare AppImage is copied and becomes the launch target', async () => {
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(src, 'Game-x86_64.AppImage'), ELF);
  await withPlatform('linux', async () => {
    const result = await installBuild({
      archivePath: path.join(src, 'Game-x86_64.AppImage'),
      gameDir: dest,
    });
    assert.equal(result.ok, true);
    assert.match(result.launch, /Game-x86_64\.AppImage$/);
    // Copied, not moved: a failed install must leave the download retryable.
    assert.ok(fs.existsSync(path.join(src, 'Game-x86_64.AppImage')));
  });
});

test('linux: a tarball is unpacked and the largest ELF wins over helpers', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'game', 'openmw.x86_64'), ELF, 5000);
  writeBinary(path.join(stage, 'game', 'openmw-cs.x86_64'), ELF, 1200);
  writeBinary(path.join(stage, 'game', 'lib', 'libavcodec.so.58'), ELF, 9000);
  const archive = path.join(src, 'openmw-Linux-64Bit.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', stage, '.']);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    // The .so is bigger but is a library, and the editor is a real binary but
    // smaller — the game must win.
    assert.match(result.launch, /openmw\.x86_64$/);
  });
});

test('nested archives are unwrapped until something runnable appears', async () => {
  const inner = tmp('inner');
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  // Zelda 64 Recompiled's real shape: a zip wrapping a tar.gz.
  writeBinary(path.join(inner, 'Zelda64Recompiled'), ELF, 4000);
  execFileSync('tar', ['-czf', path.join(stage, 'Zelda64Recompiled.tar.gz'), '-C', inner, '.']);
  const archive = path.join(src, 'Zelda64Recompiled-Linux-X64.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    assert.match(result.launch, /Zelda64Recompiled$/);
  });
});

test('an archive shipped as game data is left alone once a binary is found', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'game'), ELF, 4000);
  fs.writeFileSync(path.join(stage, 'assets.zip'), Buffer.alloc(256, 7));
  const archive = path.join(src, 'release.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', stage, '.']);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    assert.match(result.launch, /game$/);
    // Recursion stops at the first runnable layer, so the data archive stays.
    assert.ok(fs.existsSync(path.join(dest, 'assets.zip')));
  });
});

test('windows: a PE is chosen and the uninstaller is ignored', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'unins000.exe'), PE, 9000);
  writeBinary(path.join(stage, 'Game.exe'), PE, 4000);
  writeBinary(path.join(stage, 'zlib.dll'), PE, 20000);
  const archive = path.join(src, 'Game-windows-x64.zip');
  zip(stage, archive);

  await withPlatform('win32', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    // Both the uninstaller and the DLL are larger; neither is the game.
    assert.match(result.launch, /Game\.exe$/);
  });
});

test('windows: a Linux binary in the payload is not treated as runnable', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'game-linux'), ELF, 4000);
  const archive = path.join(src, 'mixed.zip');
  zip(stage, archive);

  await withPlatform('win32', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, false);
    assert.match(result.reason, /no runnable program|only ships a/i);
  });
});

test('macos: the executable inside a .app bundle is preferred', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'Game.app', 'Contents', 'MacOS', 'Game'), MACHO, 3000);
  writeBinary(path.join(stage, 'tools', 'helper'), MACHO, 8000);
  const archive = path.join(src, 'Game-macos.zip');
  zip(stage, archive);

  await withPlatform('darwin', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    assert.match(result.launch, /Game\.app\/Contents\/MacOS\/Game$/);
  });
});

test('a payload with nothing runnable fails with a reason, not a crash', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  fs.writeFileSync(path.join(stage, 'README.md'), 'build it yourself');
  const archive = path.join(src, 'source.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, false);
    assert.match(result.reason, /no runnable program|only ships a/i);
  });
});

test('a native binary beats a larger executable jar', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  // REDRIVER2's real layout: a jpsxdec.jar marked executable sits beside the
  // actual game binary. Ranking by size alone hands over the Java tool.
  writeBinary(path.join(stage, 'install', 'jpsxdec.jar'), Buffer.from('PK'), 9000);
  writeBinary(path.join(stage, 'REDRIVER2_dev'), ELF, 2000);
  const archive = path.join(src, 'redriver2-linux.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    assert.match(result.launch, /REDRIVER2_dev$/);
  });
});

test('a Windows-only release is played through Wine where Wine exists', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  // smw, SVR07 and Zelda-3-Launcher each ship a single zip with no platform
  // in the name; only the contents reveal it is Windows-only. Declining those
  // outright was a choice, not a limit — Wine runs them.
  writeBinary(path.join(stage, 'smw.exe'), PE, 3000);
  writeBinary(path.join(stage, 'SDL2.dll'), PE, 5000);
  const archive = path.join(src, 'smw_0.1.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    if (result.ok) {
      // The DLL is larger; the game must still win.
      assert.match(result.launch, /^wine:.*smw\.exe$/);
    } else {
      // On a machine without Wine, say that — and never blame the player for
      // not building it themselves.
      assert.match(result.reason, /only ships a Windows build/i);
      assert.doesNotMatch(result.reason, /building/i);
    }
  });
});

test('a macOS-only release is declined, since Wine cannot help there', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'Game'), MACHO, 3000);
  const archive = path.join(src, 'game-mac.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, false);
    assert.match(result.reason, /only ships a macOS build/i);
  });
});

test('an assets-only release is correctly described as needing a build', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  fs.mkdirSync(path.join(stage, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'assets', 'config_menu.rml'), '<rml/>');
  const archive = path.join(src, 'Quest64Recompiledv0.1.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, false);
    assert.match(result.reason, /assets or source only/i);
  });
});

test('updating preserves saves and settings, and takes the new binary', async () => {
  const v1 = tmp('v1');
  const v2 = tmp('v2');
  const src = tmp('src');
  const dest = tmp('dest');

  writeBinary(path.join(v1, 'game'), ELF, 2000);
  const first = path.join(src, 'game-v1.zip');
  zip(v1, first);
  await withPlatform('linux', async () => {
    assert.equal((await installBuild({ archivePath: first, gameDir: dest })).ok, true);
  });

  // The player then plays: saves, a settings file, and a mod appear.
  fs.mkdirSync(path.join(dest, 'saves'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'saves', 'slot1.sav'), 'hard-won progress');
  fs.writeFileSync(path.join(dest, 'config.ini'), 'fullscreen=1');
  fs.mkdirSync(path.join(dest, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'mods', 'texture-pack.bin'), 'mod');

  // v2 ships a bigger binary and its own default config.
  writeBinary(path.join(v2, 'game'), ELF, 6000);
  fs.writeFileSync(path.join(v2, 'config.ini'), 'fullscreen=0');
  const second = path.join(src, 'game-v2.zip');
  zip(v2, second);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: second, gameDir: dest });
    assert.equal(result.ok, true);
    // New binary took effect.
    assert.equal(fs.statSync(result.launch).size, 6000);
  });

  // Progress survived, and the player's settings beat the shipped defaults.
  assert.equal(fs.readFileSync(path.join(dest, 'saves', 'slot1.sav'), 'utf8'), 'hard-won progress');
  assert.equal(fs.readFileSync(path.join(dest, 'config.ini'), 'utf8'), 'fullscreen=1');
  assert.ok(fs.existsSync(path.join(dest, 'mods', 'texture-pack.bin')));
  // No staging directory left behind.
  assert.equal(fs.readdirSync(path.dirname(dest)).filter((n) => n.includes('userdata')).length, 0);
});

test('saves nested deep inside the payload are preserved too', async () => {
  const v1 = tmp('v1');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(v1, 'bin', 'game'), ELF, 2000);
  const archive = path.join(src, 'game.zip');
  zip(v1, archive);

  await withPlatform('linux', async () => {
    await installBuild({ archivePath: archive, gameDir: dest });
    fs.mkdirSync(path.join(dest, 'bin', 'userdata'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'bin', 'userdata', 'profile.sav'), 'me');
    fs.writeFileSync(path.join(dest, 'bin', 'quicksave.state1'), 'mid-boss');

    await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(fs.readFileSync(path.join(dest, 'bin', 'userdata', 'profile.sav'), 'utf8'), 'me');
    assert.equal(fs.readFileSync(path.join(dest, 'bin', 'quicksave.state1'), 'utf8'), 'mid-boss');
  });
});

test('a failed reinstall does not cost the player their saves', async () => {
  const v1 = tmp('v1');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(v1, 'game'), ELF, 2000);
  zip(v1, path.join(src, 'good.zip'));

  await withPlatform('linux', async () => {
    await installBuild({ archivePath: path.join(src, 'good.zip'), gameDir: dest });
    fs.mkdirSync(path.join(dest, 'saves'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'saves', 'slot1.sav'), 'progress');

    // A release with nothing runnable in it — the install fails after the wipe.
    const broken = tmp('broken');
    fs.writeFileSync(path.join(broken, 'README.md'), 'source only');
    const brokenZip = path.join(src, 'broken.zip');
    zip(broken, brokenZip);

    const result = await installBuild({ archivePath: brokenZip, gameDir: dest });
    assert.equal(result.ok, false);
    assert.equal(fs.readFileSync(path.join(dest, 'saves', 'slot1.sav'), 'utf8'), 'progress');
  });
});

test('a missing download reports that rather than throwing', async () => {
  const result = await installBuild({
    archivePath: path.join(tmp('src'), 'not-there.zip'),
    gameDir: tmp('dest'),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no longer in your downloads/i);
});

test('reinstalling replaces the previous contents instead of merging', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'stale-from-old-version'), 'x');
  writeBinary(path.join(stage, 'game'), ELF, 2000);
  const archive = path.join(src, 'release.zip');
  zip(stage, archive);

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest });
    assert.equal(result.ok, true);
    assert.ok(!fs.existsSync(path.join(dest, 'stale-from-old-version')));
  });
});

// Launching. Spawning successfully is not launching successfully — these cover
// the gap that made Play look like it did nothing at all.
function writeScript(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(file, 0o755);
}

test('a game that dies on start reports why, instead of claiming success', async () => {
  const dir = tmp('launch');
  const script = path.join(dir, 'game');
  // Symphony of the Night's real behaviour without the .NET runtime.
  writeScript(script, 'echo "You must install .NET to run this application." >&2\nexit 131');

  const result = await launchBuild(script);
  assert.equal(result.ok, false);
  // The runtime's own message names the problem but not the fix, so we do —
  // and the fix is to let Classicomp provision it, never to sudo anything.
  assert.match(result.reason, /Classicomp could not provide it/i);
  assert.doesNotMatch(result.reason, /sudo/i);
});

test('a missing shared library is named so it can be installed', async () => {
  const dir = tmp('launch');
  const script = path.join(dir, 'game');
  writeScript(script, 'echo "./game: error while loading shared libraries: libSDL2-2.0.so.0: cannot open" >&2\nexit 127');

  const result = await launchBuild(script);
  assert.equal(result.ok, false);
  assert.match(result.reason, /libSDL2-2\.0\.so\.0/);
});

test('an unrecognised early exit passes the program own first line through', async () => {
  const dir = tmp('launch');
  const script = path.join(dir, 'game');
  writeScript(script, 'echo "Save data is corrupt"\nexit 2');

  const result = await launchBuild(script);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Save data is corrupt/);
});

test('a game that keeps running is reported as launched', async () => {
  const dir = tmp('launch');
  const script = path.join(dir, 'game');
  // Outlives the watch window, the way a real game with a window does.
  writeScript(script, 'sleep 30');

  const result = await launchBuild(script);
  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
});

test('launching something that is not there says so rather than throwing', async () => {
  const result = await launchBuild(path.join(tmp('launch'), 'absent'));
  assert.equal(result.ok, false);
  assert.match(result.reason, /missing — install it again/i);
});

// Runtime provisioning. These must never hit the network: an already-present
// runtime is the case that proves detection and reuse work, and the download
// path is exercised by hand against Microsoft's real installer.
function dotnetPayload(dir, version = '10.0.0') {
  writeBinary(path.join(dir, 'sotn'), ELF, 2000);
  fs.writeFileSync(
    path.join(dir, 'sotn.runtimeconfig.json'),
    JSON.stringify({
      runtimeOptions: { tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version } },
    }),
  );
}

test('an already-provisioned runtime is reused rather than downloaded again', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  const runtimesDir = tmp('runtimes');
  dotnetPayload(stage);
  const archive = path.join(src, 'sotn-linux-x64.zip');
  zip(stage, archive);

  // A patch version of the right major already sitting there.
  fs.mkdirSync(path.join(runtimesDir, 'dotnet', 'shared', 'Microsoft.NETCore.App', '10.0.11'), {
    recursive: true,
  });

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: archive, gameDir: dest, runtimesDir });
    assert.equal(result.ok, true);
    assert.match(result.launch, /sotn$/);
    // Nothing was fetched, so no installer script was written.
    assert.ok(!fs.existsSync(path.join(runtimesDir, 'dotnet-install.sh')));
  });
});

test('a .NET game is launched with DOTNET_ROOT pointing at the provisioned runtime', async () => {
  const dir = tmp('launch');
  const runtimesDir = tmp('runtimes');
  const dotnetRoot = path.join(runtimesDir, 'dotnet');
  fs.mkdirSync(path.join(dotnetRoot, 'shared', 'Microsoft.NETCore.App', '10.0.11'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, 'sotn.runtimeconfig.json'),
    JSON.stringify({ runtimeOptions: { framework: { name: 'Microsoft.NETCore.App', version: '10.0.0' } } }),
  );
  // Reports the variable it was handed, then exits so the reason carries it.
  writeScript(path.join(dir, 'sotn'), 'echo "root=$DOTNET_ROOT"\nexit 1');

  const result = await launchBuild(path.join(dir, 'sotn'), { runtimesDir });
  assert.equal(result.ok, false);
  assert.ok(
    result.reason.includes(dotnetRoot),
    `expected the launch environment to name ${dotnetRoot}, got: ${result.reason}`,
  );
});

test('a native game is launched without any runtime provisioning', async () => {
  const dir = tmp('launch');
  const runtimesDir = tmp('runtimes');
  writeScript(path.join(dir, 'game'), 'sleep 30');

  const result = await launchBuild(path.join(dir, 'game'), { runtimesDir });
  assert.equal(result.ok, true);
  // No runtimeconfig means nothing to provision, so nothing was fetched.
  assert.ok(!fs.existsSync(path.join(runtimesDir, 'dotnet')));
});

test('a download the browser renamed is still found and un-renamed', async () => {
  const src = tmp('src');
  const dest = tmp('dest');
  // Chromium appends .txt to extensionless downloads, so the real Crash
  // payload — a bare ELF — landed as CrashBandicoot-Linux.txt. Failing with
  // "no longer in your downloads" over a rename is worse than looking for it.
  writeBinary(path.join(src, 'CrashBandicoot-Linux.txt'), ELF, 4000);

  await withPlatform('linux', async () => {
    const result = await installBuild({
      archivePath: path.join(src, 'CrashBandicoot-Linux'),
      gameDir: dest,
    });
    assert.equal(result.ok, true);
    // Restored to the release's own name: a payload left as .txt reads as a
    // data file and would be skipped when picking the executable.
    assert.match(result.launch, /CrashBandicoot-Linux$/);
  });
});

test('a duplicate-numbered download is found, newest first', async () => {
  const stage = tmp('stage');
  const src = tmp('src');
  const dest = tmp('dest');
  writeBinary(path.join(stage, 'game'), ELF, 2000);
  zip(stage, path.join(src, 'release (1).zip'));

  await withPlatform('linux', async () => {
    const result = await installBuild({ archivePath: path.join(src, 'release.zip'), gameDir: dest });
    assert.equal(result.ok, true);
  });
});

test('a prerequisite file is placed where the game looks for it', async () => {
  const dir = tmp('launch');
  const rom = path.join(tmp('roms'), 'my-dump.gba');
  fs.writeFileSync(rom, 'ROMDATA');
  writeScript(path.join(dir, 'tmc_pc'), 'sleep 30');

  const result = await launchBuild(path.join(dir, 'tmc_pc'), {
    prerequisite: { kind: 'file', names: ['baserom.gba'] },
    romPath: rom,
  });
  assert.equal(result.ok, true);
  // Minish Cap looks for baserom.gba beside the binary and shows an error
  // dialog when it is absent — which reads as "launched" to any watcher.
  assert.equal(fs.readFileSync(path.join(dir, 'baserom.gba'), 'utf8'), 'ROMDATA');
});

test('a prerequisite argument is passed on the command line', async () => {
  const dir = tmp('launch');
  const rom = path.join(tmp('roms'), 'disc.cue');
  fs.writeFileSync(rom, 'CUE');
  // Reports its arguments, then exits so they land in the failure reason.
  writeScript(path.join(dir, 'game'), 'echo "args:$*"\nexit 1');

  const result = await launchBuild(path.join(dir, 'game'), {
    prerequisite: { kind: 'argument', flag: '--run' },
    romPath: rom,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /--run/);
  assert.ok(result.reason.includes(rom), `expected the cue path in: ${result.reason}`);
});

test('a linked copy that has been moved is reported, not silently ignored', async () => {
  const dir = tmp('launch');
  writeScript(path.join(dir, 'game'), 'sleep 30');

  const result = await launchBuild(path.join(dir, 'game'), {
    prerequisite: { kind: 'file', names: ['baserom.gba'] },
    romPath: '/nowhere/gone.gba',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no longer at/i);
});
