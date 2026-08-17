import type { DownloadAsset } from '../domain/types';
import { wineIsAvailable } from './shell';

// Real downloads: release assets are fetched with streaming progress and
// handed to the browser as a saved file. When streaming is not possible
// (CORS, redirect chains), the asset URL is opened directly so the browser's
// own download manager takes over — either way a real download starts.

export interface DownloadProgressEvent {
  received: number;
  total: number | null;
  bytesPerSecond: number;
}

export type TargetPlatform = 'linux' | 'win32' | 'darwin';

// Scores that mean the same thing on every platform: phone and console builds
// and debug artifacts are never the download a desktop player wants.
const UNIVERSAL_SCORES: Array<[RegExp, number]> = [
  [/android|\.apk($|\?)|ios|\.ipa($|\?)/, -60],
  [/switch|\.nro($|\?)|wiiu|3ds|\.vpk($|\?)|\.opk($|\?)/, -40],
  [/debug|symbols|\.pdb($|\?)/, -30],
  // Development builds sit beside the real release in the same upload
  // (REDRIVER2 ships both); the plain release is what a player wants.
  [/[-_]dev([-_.]|$)/, -15],
  // Build inputs, not the game: several projects attach a compiler toolchain
  // or a source tarball to the same release as (or instead of) the binary.
  // Betrayal at Krondor publishes only a toolchain.tar.gz, and offering that
  // as "Download" hands the player something that will never launch.
  [/toolchain|(^|[-_])sdk([-_.]|$)|(^|[-_])sources?([-_.]|$)|[-_]src[-_.]/, -60],
];

export type TargetArch = 'x64' | 'arm64';

const ARCH_PATTERNS: Record<TargetArch, RegExp> = {
  x64: /x86[-_]?64|amd64|x64|i686|x86(?![-_]?64)/,
  arm64: /arm64|aarch64|armv8/,
};

// Architecture is a hard constraint, not a preference: an x86_64 binary does
// not start on an ARM Linux box at all, so it is filtered out rather than
// merely scored down — no amount of "this is the only build available" makes
// it runnable. Two deliberate exceptions:
//   * an asset that names no architecture is assumed compatible, because most
//     releases here (soh.appimage, spaghetti.appimage) simply do not say;
//   * Apple Silicon runs x64 builds through Rosetta 2, so on darwin/arm64 a
//     foreign build stays eligible and is merely ranked below native.
function archCompatible(name: string, platform: TargetPlatform, arch: TargetArch): boolean {
  const foreign: TargetArch = arch === 'x64' ? 'arm64' : 'x64';
  if (ARCH_PATTERNS[arch].test(name) || /universal/.test(name)) return true;
  if (!ARCH_PATTERNS[foreign].test(name)) return true;
  return platform === 'darwin' && arch === 'arm64';
}

// Ranking within the compatible set: native beats Rosetta, and on macOS a
// universal binary is as good as native.
function archScores(platform: TargetPlatform, arch: TargetArch): Array<[RegExp, number]> {
  return [
    [ARCH_PATTERNS[arch], 18],
    [/universal/, platform === 'darwin' ? 18 : 0],
  ];
}

// Per-platform preferences. Each table both promotes this platform's formats
// and demotes the others, so a repo that ships builds for all three still
// resolves to the one that can actually run here.
// Built per call, not once at module load: Wine availability is resolved
// asynchronously at startup, after this module is first imported.
function platformScores(): Record<TargetPlatform, Array<[RegExp, number]>> {
  return {
  linux: [
    // Self-contained formats outrank loose archives even when the archive
    // says "linux". A tarball depends on whatever system libraries the
    // builder happened to have: REDRIVER2's tarball dies on libjpeg.so.8,
    // while the flatpak of the same release bundles it and simply runs.
    [/appimage/, 60],
    [/\.flatpak($|\?)/, 58],
    [/linux/, 40],
    [/\.tar\.(gz|xz|zst)($|\?)/, 10],
    [/\.zip($|\?)/, 5],
    // Windows builds are playable here through Wine, so they are a last
    // resort rather than a disqualification — but only when Wine is actually
    // installed, otherwise offering one is a download that cannot run.
    [/win(dows|32|64)?|\.exe($|\?)|\.msi($|\?)/, wineIsAvailable() ? 12 : -60],
    [/mac|darwin|osx|\.dmg($|\?)|\.pkg($|\?)/, -60],
  ],
  win32: [
    [/win(dows|32|64)?/, 60],
    [/\.exe($|\?)|\.msi($|\?)/, 40],
    [/\.zip($|\?)/, 25],
    // Tarballs are perfectly installable on Windows — tar.exe has shipped
    // since Windows 10 1803 — so they are a mild preference, not a penalty.
    // Only genuinely foreign formats are disqualifying.
    [/\.tar\.(gz|xz|zst)($|\?)/, 10],
    // An installer is a worse default than a portable build: it mutates the
    // system and Classicomp cannot then find what it produced.
    [/setup|installer/, -20],
    [/linux|\.appimage($|\?)|\.flatpak($|\?)/, -60],
    [/mac|darwin|osx|\.dmg($|\?)|\.pkg($|\?)/, -60],
  ],
  darwin: [
    [/mac(os)?|darwin|osx/, 60],
    [/\.dmg($|\?)/, 30],
    [/\.zip($|\?)/, 15],
    [/\.tar\.(gz|xz|zst)($|\?)/, 10],
    [/win(dows|32|64)?|\.exe($|\?)|\.msi($|\?)/, -60],
    [/linux|\.appimage($|\?)|\.flatpak($|\?)/, -60],
  ],
  };
}

// The renderer has no process.platform, so the desktop shell publishes one and
// the user agent is the fallback. Defaults to linux only as a last resort.
export function detectPlatform(): TargetPlatform {
  const declared = typeof window !== 'undefined' ? window.classicompShell?.platform : undefined;
  if (declared === 'win32' || declared === 'darwin' || declared === 'linux') return declared;
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (agent.includes('windows')) return 'win32';
  if (agent.includes('mac os') || agent.includes('macintosh')) return 'darwin';
  return 'linux';
}

// The user agent lies about architecture on Apple Silicon (it still reports
// Intel), so process.arch from the shell is the only trustworthy source;
// x64 is the fallback because that is what an unknown desktop most likely is.
export function detectArch(): TargetArch {
  const declared = typeof window !== 'undefined' ? window.classicompShell?.arch : undefined;
  if (declared === 'arm64') return 'arm64';
  if (declared === 'x64' || declared === 'ia32') return 'x64';
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  return /aarch64|arm64/.test(agent) ? 'arm64' : 'x64';
}

// Plenty of projects in this catalogue publish for one platform only. When
// the best thing on offer still scores negative, every candidate carries a
// foreign-platform penalty, and downloading it would hand the player a file
// that cannot install here. Returning null instead sends the UI down its
// release-page path, which is the honest option.
// The winning asset's score, so callers can compare offers across projects.
// A game routinely has several implementations, and taking the first one that
// happens to publish anything hands over a Wine-only Windows build while a
// sibling project ships a native AppImage — which is exactly what Mario Kart
// 64 did.
export function bestAssetFor(
  assetLists: DownloadAsset[][],
  platform: TargetPlatform = detectPlatform(),
  arch: TargetArch = detectArch(),
): { index: number; asset: DownloadAsset } | null {
  const offers = assetLists
    .map((assets, index) => {
      const asset = pickBestAsset(assets, platform, arch);
      return asset === null
        ? null
        : { index, asset, score: scoreAsset(asset.name, platform, arch) };
    })
    .filter((offer): offer is { index: number; asset: DownloadAsset; score: number } => offer !== null);
  if (offers.length === 0) return null;
  offers.sort((left, right) => right.score - left.score);
  return { index: offers[0].index, asset: offers[0].asset };
}

function scoreAsset(name: string, platform: TargetPlatform, arch: TargetArch): number {
  const table = [...platformScores()[platform], ...archScores(platform, arch), ...UNIVERSAL_SCORES];
  const lower = name.toLowerCase();
  let score = 0;
  for (const [pattern, value] of table) {
    if (pattern.test(lower)) score += value;
  }
  return score;
}

export function pickBestAsset(
  assets: DownloadAsset[],
  platform: TargetPlatform = detectPlatform(),
  arch: TargetArch = detectArch(),
): DownloadAsset | null {
  if (assets.length === 0) return null;
  const table = [...platformScores()[platform], ...archScores(platform, arch), ...UNIVERSAL_SCORES];
  const runnable = assets.filter((asset) =>
    archCompatible(asset.name.toLowerCase(), platform, arch),
  );
  if (runnable.length === 0) return null;
  let best: DownloadAsset | null = null;
  let bestScore = -Infinity;
  for (const asset of runnable) {
    const name = asset.name.toLowerCase();
    let score = 0;
    for (const [pattern, value] of table) {
      if (pattern.test(name)) score += value;
    }
    if (score > bestScore || (score === bestScore && (asset.sizeBytes ?? 0) > (best?.sizeBytes ?? 0))) {
      best = asset;
      bestScore = score;
    }
  }
  return bestScore < 0 ? null : best;
}

function saveBlob(blob: Blob, filename: string, doc: Document): void {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function openInBrowser(url: string, doc: Document): void {
  const anchor = doc.createElement('a');
  anchor.href = url;
  // Release asset responses carry Content-Disposition: attachment, so this
  // starts a download rather than navigating.
  anchor.rel = 'noopener';
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// Streaming buffers the file in memory before saving, so very large assets
// go straight to the browser's download manager instead.
export const STREAM_SIZE_LIMIT = 200 * 1024 * 1024;

export async function downloadAssetFile(
  asset: DownloadAsset,
  onProgress: (event: DownloadProgressEvent) => void,
  fetchFn: typeof fetch = (...args) => fetch(...args),
  doc: Document = document,
): Promise<'streamed' | 'browser'> {
  if (asset.sizeBytes !== null && asset.sizeBytes > STREAM_SIZE_LIMIT) {
    openInBrowser(asset.url, doc);
    return 'browser';
  }
  try {
    const response = await fetchFn(asset.url);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    const total =
      asset.sizeBytes ??
      (Number(response.headers.get('content-length')) || null);
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    const startedAt = Date.now();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.05);
        onProgress({ received, total, bytesPerSecond: Math.round(received / elapsed) });
      }
    }

    // An explicit binary type is load-bearing, not decoration. A Blob with no
    // MIME type is treated as text/plain, and Chromium then "helpfully"
    // appends .txt to any download whose name has no extension — so
    // CrashBandicoot-Linux landed as CrashBandicoot-Linux.txt. The file was
    // correct, but the name recorded for installing no longer matched what was
    // on disk, so installing then failed with "no longer in your downloads".
    saveBlob(new Blob(chunks, { type: 'application/octet-stream' }), asset.name, doc);
    return 'streamed';
  } catch {
    openInBrowser(asset.url, doc);
    return 'browser';
  }
}
