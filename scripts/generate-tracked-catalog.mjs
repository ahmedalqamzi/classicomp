// Run through scripts/bundle-catalog-generator.mjs, not directly.
//
// The seed records come from the separate tracker checkout. Its location is
// read from RECOMP_TRACKER_PATH rather than hardcoded, so this file carries no
// absolute path from whoever happened to run it last — an account name in a
// committed import is a small, needless leak.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const trackerPath = process.env.RECOMP_TRACKER_PATH;
if (!trackerPath) {
  throw new Error(
    'Set RECOMP_TRACKER_PATH to the recomp-tracker checkout, e.g. RECOMP_TRACKER_PATH=~/recomp-tracker',
  );
}
const { SEED_RECORDS } = await import(
  `${trackerPath.replace(/\/$/, '')}/server/catalog/seed-records.ts`
);

const OUT = new URL('../src/data/tracked-projects.json', import.meta.url).pathname;
const PULLED = new URL('./pulled-descriptions.json', import.meta.url).pathname;

// Descriptions pulled from each repository's own page (see the pull task in
// scripts/); the tracker's verified evidence claim is the fallback.
const pulledDescriptions = existsSync(PULLED)
  ? JSON.parse(readFileSync(PULLED, 'utf8'))
  : {};

// Cover art pulled per game (Wikipedia page images) and screenshots pulled
// per project (README image extraction); both optional.
const COVERS = new URL('./pulled-covers.json', import.meta.url).pathname;
const SCREENSHOTS = new URL('./pulled-screenshots.json', import.meta.url).pathname;
const AUDIT = new URL('./media-audit.json', import.meta.url).pathname;
const pulledCovers = existsSync(COVERS) ? JSON.parse(readFileSync(COVERS, 'utf8')) : {};
const pulledScreenshots = existsSync(SCREENSHOTS)
  ? JSON.parse(readFileSync(SCREENSHOTS, 'utf8'))
  : {};
const mediaAudit = existsSync(AUDIT)
  ? JSON.parse(readFileSync(AUDIT, 'utf8'))
  : { covers: {}, screenshots: {} };

// Verified in-game captures from the libretro-thumbnails database, keyed by
// gameKey; these are true gameplay and always outrank README-scraped images.
const GAMEPLAY = new URL('./pulled-gameplay.json', import.meta.url).pathname;
const pulledGameplay = existsSync(GAMEPLAY)
  ? JSON.parse(readFileSync(GAMEPLAY, 'utf8'))
  : {};

// Real downloadable release assets baked per project; scans keep them fresh.
const ASSETS = new URL('./pulled-assets.json', import.meta.url).pathname;
const pulledAssets = existsSync(ASSETS) ? JSON.parse(readFileSync(ASSETS, 'utf8')) : {};

// Release facts pulled from GitHub releases.atom feeds for ports the scans
// have not reached yet; a published release is release evidence.
const RELEASES = new URL('./pulled-releases.json', import.meta.url).pathname;
const pulledReleases = existsSync(RELEASES)
  ? JSON.parse(readFileSync(RELEASES, 'utf8'))
  : {};

function withPulledRelease(record) {
  const release = pulledReleases[record.id];
  if (!release || record.latestVersion !== null) return record;
  return {
    ...record,
    latestVersion: release.version,
    downloadUrl: record.downloadUrl ?? release.url,
    recentReleases:
      record.recentReleases.length > 0
        ? record.recentReleases
        : [{ version: release.version, url: release.url, publishedAt: release.publishedAt ?? null }],
  };
}

function assetsFor(id) {
  const assets = pulledAssets[id];
  if (!Array.isArray(assets)) return [];
  return assets
    .filter((a) => a && typeof a.name === 'string' && typeof a.url === 'string')
    .map((a) => ({
      name: a.name,
      url: a.url,
      sizeBytes: typeof a.sizeBytes === 'number' ? a.sizeBytes : null,
    }))
    .slice(0, 12);
}

// Same validation the runtime media connector applies: junk filenames are
// disqualified, portrait/near-square images are box art, landscape images
// pass only when named as boxes (real N64/SNES boxes are landscape).
const COVER_JUNK = /\b(screenshots?|gameplay|logos?|icons?|menu|gui|wallpaper|settings?|svg)\b/;
const LANDSCAPE_BOX = /box|cover|packaging|capa|caratula|jaquette|kutu/;
const SHOT_JUNK =
  /\b(shields|badgen|badge|workflows|discord|svg|logos?|favicon|icons?|settings?|controller|config|menu|diagram|chart|install|build|objdiff|launcher|gyro|extract|propert\w*|banner|title|dolphin)\b|#gh-(light|dark)-mode/;
const normalizeMediaName = (url) => url.toLowerCase().replace(/[-_./?#%]+/g, ' ');

function coverFor(key) {
  const cover = pulledCovers[key];
  if (typeof cover !== 'string' || cover.length === 0) return { url: null, aspect: null };
  const name = normalizeMediaName(cover);
  if (COVER_JUNK.test(name)) return { url: null, aspect: null };
  const aspect = mediaAudit.covers?.[key]?.aspect ?? null;
  if (aspect === null) {
    return LANDSCAPE_BOX.test(name) ? { url: cover, aspect: null } : { url: null, aspect: null };
  }
  if (aspect <= 1.05 || LANDSCAPE_BOX.test(name)) return { url: cover, aspect };
  return { url: null, aspect: null };
}

function screenshotsFor(id, key) {
  const gameplay = Array.isArray(pulledGameplay[key])
    ? pulledGameplay[key].filter((u) => typeof u === 'string')
    : [];
  const shots = pulledScreenshots[id];
  const suspect = new Set(mediaAudit.screenshots?.[id]?.suspect ?? []);
  const readme = Array.isArray(shots)
    ? shots.filter(
        (u) => typeof u === 'string' && !suspect.has(u) && !SHOT_JUNK.test(normalizeMediaName(u)),
      )
    : [];
  // Verified gameplay leads; README project images only fill behind it.
  return [...new Set([...gameplay, ...readme])].slice(0, 8);
}

function describeRecord(record) {
  const repoUrl = record.repository?.url ?? '';
  const pulled = pulledDescriptions[repoUrl];
  if (typeof pulled === 'string' && pulled.trim().length > 0) return pulled.trim();
  return record.evidence?.[0]?.claim ?? null;
}

// Implementations that are installable through Classicomp's built-in library.
const GAME_LINKS = {
  shipwright: 'soh',
  'zelda64-recompiled': 'zelda64recompiled',
};

// Short display names: the recognizable part of the title, the way Steam
// users say it ("Twilight Princess", not "The Legend of Zelda: Twilight
// Princess"). Default rule takes the part after the last colon; overrides
// cover titles where the front half is the recognizable name.
const SHORT_TITLE_OVERRIDES = {
  'Jak and Daxter: The Precursor Legacy': 'Jak and Daxter',
  'Wario Land: Shake It!': 'Wario Land',
  'Klonoa: Empire of Dreams': 'Klonoa',
  'Classic adventure engines': 'ScummVM',
  'Ace Combat 6: Fires of Liberation': 'Ace Combat 6',
  'Duke Nukem: Zero Hour': 'Duke Nukem: Zero Hour',
  'Pokémon Pinball: Ruby & Sapphire': 'Pokémon Pinball: Ruby & Sapphire',
  'Pokémon XD: Gale of Darkness': 'Pokémon XD',
  "PokéPark Wii: Pikachu's Adventure": 'PokéPark Wii',
};

function shortTitle(title) {
  const override = SHORT_TITLE_OVERRIDES[title];
  if (override) return override;
  const colon = title.lastIndexOf(': ');
  if (colon === -1) return title;
  const tail = title.slice(colon + 2).trim();
  return tail.length >= 3 ? tail : title;
}

function gameKey(title) {
  return title
    .replace(/['’]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toTracked(record) {
  return {
    id: record.id,
    gameKey: gameKey(record.gameTitle),
    gameTitle: record.gameTitle,
    gameShortTitle: shortTitle(record.gameTitle),
    gameId: GAME_LINKS[record.id] ?? null,
    description: describeRecord(record),
    projectName: record.projectName,
    projectType: record.projectType,
    developmentState: record.developmentState,
    stability: record.stability,
    completionPercent: record.completionPercent,
    completionLabel: record.completionLabel,
    originalReleaseYear: record.originalReleaseYear,
    originalPlatforms: record.originalPlatforms,
    targetPlatforms: record.targetPlatforms,
    latestVersion: record.latestRelease?.version ?? null,
    lastActivityAt: record.lastActivityAt,
    lastCheckedAt: null,
    downloadUrl: record.latestRelease?.url ?? null,
    coverUrl: coverFor(gameKey(record.gameTitle)).url,
    coverAspect: coverFor(gameKey(record.gameTitle)).aspect,
    screenshots: screenshotsFor(record.id, gameKey(record.gameTitle)),
    topics: [],
    recentReleases: record.latestRelease
      ? [{
          version: record.latestRelease.version,
          url: record.latestRelease.url,
          publishedAt: record.latestRelease.publishedAt ?? null,
        }]
      : [],
    downloadAssets: assetsFor(record.id),
    repositoryUrl: record.repository?.url ?? '',
  };
}

// PC reimplementations from Classicomp's built-in catalog; the tracker's own
// sources are console-focused and do not include them.
function pcPort(partial) {
  return {
    gameId: null,
    projectType: 'source-port',
    developmentState: 'active',
    stability: 'stable',
    completionPercent: null,
    completionLabel: 'Released',
    targetPlatforms: ['Windows', 'Linux', 'macOS'],
    lastActivityAt: null,
    lastCheckedAt: null,
    downloadUrl: null,
    topics: [],
    recentReleases: [],
    ...partial,
    downloadAssets: assetsFor(partial.id),
    coverUrl: coverFor(gameKey(partial.gameTitle)).url,
    coverAspect: coverFor(gameKey(partial.gameTitle)).aspect,
    screenshots: screenshotsFor(partial.id, gameKey(partial.gameTitle)),
    gameKey: gameKey(partial.gameTitle),
    gameShortTitle: shortTitle(partial.gameTitle),
    description:
      (typeof pulledDescriptions[partial.repositoryUrl] === 'string' &&
        pulledDescriptions[partial.repositoryUrl].trim()) ||
      partial.description ||
      null,
  };
}

const EXTRA_RECORDS = [
  pcPort({
    id: 'openrct2',
    description: 'Open-source reimplementation of RollerCoaster Tycoon 2 with cross-platform support and active releases.',
    gameTitle: 'RollerCoaster Tycoon 2',
    gameId: 'openrct2',
    projectName: 'OpenRCT2',
    originalReleaseYear: 2002,
    originalPlatforms: ['Windows'],
    latestVersion: '0.5.4',
    repositoryUrl: 'https://github.com/OpenRCT2/OpenRCT2',
  }),
  pcPort({
    id: 'devilutionx',
    description: 'Modern source port of Diablo and Hellfire focused on accurate gameplay and portable builds.',
    gameTitle: 'Diablo',
    gameId: 'devilutionx',
    projectName: 'DevilutionX',
    originalReleaseYear: 1997,
    originalPlatforms: ['Windows', 'PlayStation'],
    targetPlatforms: ['Windows', 'Linux', 'macOS', 'Android'],
    latestVersion: '1.5.4',
    repositoryUrl: 'https://github.com/diasurgical/devilutionX',
  }),
  pcPort({
    id: 'openmw',
    description: 'Open-source engine reimplementation of The Elder Scrolls III: Morrowind with strong mod support.',
    gameTitle: 'The Elder Scrolls III: Morrowind',
    gameId: 'openmw',
    projectName: 'OpenMW',
    completionLabel: 'Fully playable; percentage not published',
    originalReleaseYear: 2002,
    originalPlatforms: ['Windows', 'Xbox'],
    latestVersion: '0.49.0',
    repositoryUrl: 'https://gitlab.com/OpenMW/openmw',
  }),
  pcPort({
    id: 'openttd',
    description: 'Long-running open-source remake of Transport Tycoon Deluxe with multiplayer support.',
    gameTitle: 'Transport Tycoon Deluxe',
    gameId: 'openttd',
    projectName: 'OpenTTD',
    originalReleaseYear: 1995,
    originalPlatforms: ['DOS'],
    latestVersion: '15.1',
    repositoryUrl: 'https://github.com/OpenTTD/OpenTTD',
  }),
  pcPort({
    id: 'scummvm',
    description: 'Runs hundreds of classic point-and-click adventures through reimplemented game engines.',
    gameTitle: 'Classic adventure engines',
    gameId: 'scummvm',
    projectName: 'ScummVM',
    completionLabel: 'Released; engine coverage grows per release',
    originalReleaseYear: 1990,
    originalPlatforms: ['DOS', 'Windows', 'Amiga'],
    latestVersion: '2.9.1',
    repositoryUrl: 'https://github.com/scummvm/scummvm',
  }),
];

const records = [...SEED_RECORDS.map(toTracked), ...EXTRA_RECORDS].map(withPulledRelease);
const ids = new Set();
for (const record of records) {
  if (ids.has(record.id)) throw new Error(`duplicate id: ${record.id}`);
  ids.add(record.id);
  if (!record.repositoryUrl) throw new Error(`missing repository: ${record.id}`);
}
records.sort(
  (a, b) =>
    a.gameTitle.localeCompare(b.gameTitle) || a.projectName.localeCompare(b.projectName),
);

writeFileSync(OUT, `${JSON.stringify(records, null, 2)}\n`);
console.log(`wrote ${records.length} tracked projects to ${OUT}`);
console.log(
  `games: ${new Set(records.map((record) => record.gameKey)).size}, linked to catalog: ${records.filter((record) => record.gameId).length}`,
);
