import { describe, expect, it, vi } from 'vitest';
import * as downloaderModule from './downloader';

function asset(name: string, sizeBytes: number | null = null) {
  return { name, url: `https://github.com/x/y/releases/download/v1/${name}`, sizeBytes };
}

describe('asset picking', () => {
  // A release that ships for everything at once. Each platform must resolve
  // to the build it can actually run, or the download is useless on arrival.
  const crossPlatform = [
    asset('game-windows-x64.zip'),
    asset('game-win64-setup.exe'),
    asset('game-macos-universal.dmg'),
    asset('game-linux-x86_64.AppImage'),
    asset('game-linux-aarch64.tar.gz'),
    asset('game-android.apk'),
  ];

  it('prefers Linux builds and penalizes other platforms', () => {
    expect(downloaderModule.pickBestAsset(crossPlatform, 'linux')?.name).toBe(
      'game-linux-x86_64.AppImage',
    );
  });

  it('prefers Windows builds on Windows, and a portable zip over an installer', () => {
    // The installer mutates the system and leaves nothing Classicomp can find
    // afterwards, so the portable archive wins even though both are native.
    expect(downloaderModule.pickBestAsset(crossPlatform, 'win32')?.name).toBe(
      'game-windows-x64.zip',
    );
  });

  it('prefers macOS builds on macOS', () => {
    expect(downloaderModule.pickBestAsset(crossPlatform, 'darwin')?.name).toBe(
      'game-macos-universal.dmg',
    );
  });

  it('prefers this machine architecture over foreign ones', () => {
    const both = [asset('game-linux-aarch64.tar.gz'), asset('game-linux-x86_64.tar.gz')];
    expect(downloaderModule.pickBestAsset(both, 'linux', 'x64')?.name).toBe(
      'game-linux-x86_64.tar.gz',
    );
    expect(downloaderModule.pickBestAsset(both, 'linux', 'arm64')?.name).toBe(
      'game-linux-aarch64.tar.gz',
    );
  });

  it('declines an x86 build on ARM Linux, where it cannot start at all', () => {
    expect(
      downloaderModule.pickBestAsset([asset('game-linux-x86_64.tar.gz')], 'linux', 'arm64'),
    ).toBeNull();
  });

  it('accepts an x64 build on Apple Silicon, which has Rosetta', () => {
    // Unlike ARM Linux, an Intel macOS build does run here — so it is a poor
    // second choice, not a disqualified one.
    const intelOnly = [asset('game-macos-x86_64.dmg')];
    expect(downloaderModule.pickBestAsset(intelOnly, 'darwin', 'arm64')?.name).toBe(
      'game-macos-x86_64.dmg',
    );
    // Native and universal both beat it when they are on offer.
    const all = [
      asset('game-macos-x86_64.dmg'),
      asset('game-macos-arm64.dmg'),
      asset('game-macos-universal.dmg'),
    ];
    expect(downloaderModule.pickBestAsset(all, 'darwin', 'arm64')?.name).toMatch(
      /arm64|universal/,
    );
  });

  it('picks the ARM Windows build on an ARM Windows machine', () => {
    const best = downloaderModule.pickBestAsset(
      [asset('OpenRCT2-windows-x64.zip'), asset('OpenRCT2-windows-arm64.zip')],
      'win32',
      'arm64',
    );
    expect(best?.name).toBe('OpenRCT2-windows-arm64.zip');
  });

  it('returns nothing when every asset is for another platform', () => {
    // Several projects in this catalogue publish Linux-only or Windows-only.
    // Handing back the least-bad foreign build would start a download that
    // cannot install; null sends the UI to the release page instead.
    const linuxOnly = [asset('game-linux-x86_64.AppImage'), asset('game.flatpak')];
    expect(downloaderModule.pickBestAsset(linuxOnly, 'win32')).toBeNull();
    expect(downloaderModule.pickBestAsset(linuxOnly, 'darwin')).toBeNull();
    expect(downloaderModule.pickBestAsset(linuxOnly, 'linux')).not.toBeNull();

    const windowsOnly = [asset('demo.exe')];
    expect(downloaderModule.pickBestAsset(windowsOnly, 'linux')).toBeNull();
    expect(downloaderModule.pickBestAsset(windowsOnly, 'win32')).not.toBeNull();
  });

  it('accepts a tarball on Windows, where tar.exe has shipped since Win10', () => {
    const best = downloaderModule.pickBestAsset(
      [asset('tmc-multi-windows-x86_64.tar.gz')],
      'win32',
    );
    expect(best?.name).toBe('tmc-multi-windows-x86_64.tar.gz');
  });

  it('never offers a build toolchain or source tarball as the game', () => {
    // Betrayal at Krondor attaches only a toolchain.tar.gz to its release.
    expect(downloaderModule.pickBestAsset([asset('toolchain.tar.gz')], 'linux', 'x64')).toBeNull();
    expect(downloaderModule.pickBestAsset([asset('game-sources.tar.gz')], 'linux', 'x64')).toBeNull();
    // A real build alongside one still wins.
    const mixed = [asset('toolchain.tar.gz'), asset('game-linux-x86_64.AppImage')];
    expect(downloaderModule.pickBestAsset(mixed, 'linux', 'x64')?.name).toBe(
      'game-linux-x86_64.AppImage',
    );
  });

  it('never picks a console or handheld build for a desktop', () => {
    const best = downloaderModule.pickBestAsset(
      [asset('game.nro'), asset('game-3ds.cia'), asset('game-linux.tar.gz')],
      'linux',
    );
    expect(best?.name).toBe('game-linux.tar.gz');
  });

  it('falls back to the least-penalized asset and breaks ties by size', () => {
    const best = downloaderModule.pickBestAsset([
      asset('data-pack.zip', 100),
      asset('full-bundle.zip', 900),
    ]);
    expect(best?.name).toBe('full-bundle.zip');
    expect(downloaderModule.pickBestAsset([])).toBeNull();
  });
});

describe('asset downloading', () => {
  it('streams with progress and saves the file', async () => {
    const chunkA = new Uint8Array(1024).fill(1);
    const chunkB = new Uint8Array(2048).fill(2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunkA);
        controller.enqueue(chunkB);
        controller.close();
      },
    });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers({ 'content-length': '3072' }),
    });
    const progress: number[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });

    const result = await downloaderModule.downloadAssetFile(
      asset('game.AppImage', 3072),
      (event) => progress.push(event.received),
      fetchFn as unknown as typeof fetch,
      document,
    );

    expect(result).toBe('streamed');
    expect(progress).toEqual([1024, 3072]);
  });

  it('saves as binary so the browser cannot append .txt to the name', async () => {
    // A Blob with no MIME type is treated as text/plain, and Chromium then
    // appends .txt to any download whose filename has no extension. That is
    // how CrashBandicoot-Linux landed on disk as CrashBandicoot-Linux.txt —
    // the right bytes under a name that no longer matched what installing
    // looked for, so installing failed with "no longer in your downloads".
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16).fill(7));
        controller.close();
      },
    });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers({ 'content-length': '16' }),
    });
    const saved: Array<{ type: string; download: string }> = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        saved.push({ type: blob.type, download: '' });
        return 'blob:x';
      }),
      revokeObjectURL: vi.fn(),
    });
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.addEventListener('click', () => {
          saved[saved.length - 1].download = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    // An extensionless asset name is the case that breaks.
    await downloaderModule.downloadAssetFile(
      asset('CrashBandicoot-Linux', 16),
      () => {},
      fetchFn as unknown as typeof fetch,
      document,
    );

    expect(saved[0].type).toBe('application/octet-stream');
    expect(saved[0].download).toBe('CrashBandicoot-Linux');
    // The spy replaces a document-level method; leaving it in place breaks
    // every later test that creates an anchor.
    createSpy.mockRestore();
  });

  it('falls back to a browser-managed download when streaming fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('cors'));
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.addEventListener('click', () => clicks.push((el as HTMLAnchorElement).href));
      }
      return el;
    });

    const result = await downloaderModule.downloadAssetFile(
      asset('game.AppImage'),
      () => {},
      fetchFn as unknown as typeof fetch,
      document,
    );

    expect(result).toBe('browser');
    expect(clicks[0]).toContain('/releases/download/v1/game.AppImage');
    createSpy.mockRestore();
  });
});

describe("choosing between a game's implementations", () => {
  it('prefers the project with a native build over one that needs Wine', () => {
    // Mario Kart 64 has three implementations: one publishes a Windows-only
    // zip, another a native AppImage. Taking the first project that publishes
    // anything sent the player through Wine for no reason.
    const windowsOnly = [asset('MK64Recompiled-v1.0.0-Windows.zip')];
    const native = [asset('MarioKart_64_Recompiled-0.9.2-anylinux-x86_64.AppImage')];

    const best = downloaderModule.bestAssetFor([windowsOnly, native], 'linux', 'x64');
    expect(best?.index).toBe(1);
    expect(best?.asset.name).toMatch(/AppImage$/);
  });

  it('still offers the only implementation that has anything at all', () => {
    const best = downloaderModule.bestAssetFor(
      [[], [asset('game-linux-x86_64.tar.gz')]],
      'linux',
      'x64',
    );
    expect(best?.index).toBe(1);
  });

  it('returns nothing when no implementation has a usable build', () => {
    expect(downloaderModule.bestAssetFor([[], []], 'linux', 'x64')).toBeNull();
  });
});
