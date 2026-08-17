// Fills scripts/pulled-gameplay.json with verified in-game captures from the
// libretro-thumbnails database (Named_Snaps + Named_Titles per system repo),
// honoring the contract generate-tracked-catalog.mjs documents for that file.
// Games with no libretro match keep their existing pulled entry untouched.
// Usage: node scripts/pull-libretro-gameplay.mjs   (GITHUB_TOKEN optional)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CATALOG = new URL('../src/data/tracked-projects.json', import.meta.url).pathname;
const OUT = new URL('./pulled-gameplay.json', import.meta.url).pathname;

const SYSTEM_REPOS = {
  'Nintendo 64': 'Nintendo_-_Nintendo_64',
  'Nintendo 64 prototype': 'Nintendo_-_Nintendo_64',
  'Xbox 360': 'Microsoft_-_Xbox_360',
  'Nintendo GameCube': 'Nintendo_-_GameCube',
  'Game Boy Advance': 'Nintendo_-_Game_Boy_Advance',
  'Nintendo DS': 'Nintendo_-_Nintendo_DS',
  PlayStation: 'Sony_-_PlayStation',
  Wii: 'Nintendo_-_Wii',
  'Game Boy Color': 'Nintendo_-_Game_Boy_Color',
  'PlayStation 2': 'Sony_-_PlayStation_2',
  'Game Boy': 'Nintendo_-_Game_Boy',
  'Game Boy prototype': 'Nintendo_-_Game_Boy',
  'Nintendo Entertainment System': 'Nintendo_-_Nintendo_Entertainment_System',
  DOS: 'DOS',
  'PlayStation 3': 'Sony_-_PlayStation_3',
  'Super Nintendo': 'Nintendo_-_Super_Nintendo_Entertainment_System',
  'Sega Saturn': 'Sega_-_Saturn',
  Amiga: 'Commodore_-_Amiga',
  Xbox: 'Microsoft_-_Xbox',
  'Nintendo 3DS': 'Nintendo_-_Nintendo_3DS',
};

// Upstream names that no amount of normalizing will land on.
const ALIASES = {
  'animal-forest': 'Doubutsu no Mori (Japan)',
  'animal-forest-e': 'Doubutsu no Mori e+ (Japan)',
  'crash-team-racing': 'CTR - Crash Team Racing',
  'dragon-quest-ix': 'Dragon Quest IX - Sentinels of the Starry Skies',
  'pokemon-card-gb2': 'Pokemon Trading Card Game 2 - The Invasion of Team GR',
  'space-station-silicon-valley': 'SpaceStation Silicon Valley',
};

// Games whose catalogued platform has no thumbnails upstream but which
// shipped identically on a covered system.
const EXTRA_SYSTEMS = {
  'wwe-smackdown-vs-raw-2007': 'Sony_-_PlayStation_2',
};

// Region preference for picking among multiple dumps of the same title.
const REGION_RANK = [/\(usa/i, /\(world/i, /\(europe/i, /\(japan/i];

function regionScore(filename) {
  const index = REGION_RANK.findIndex((pattern) => pattern.test(filename));
  return index === -1 ? REGION_RANK.length : index;
}

// No-Intro names move articles ("Legend of Zelda, The"), swap ':' for ' - ',
// and suffix "Version" ("Pokemon - Crystal Version"); normalizing both sides
// down to bare ASCII word soup absorbs all of that, é included.
function normalizeTitle(raw) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(
      (word) => word.length > 0 && word !== 'the' && word !== 'version' && word !== 'and',
    )
    .join(' ');
}

async function fetchTree(repo, attempt = 1) {
  const headers = { 'User-Agent': 'classicomp-media-pull' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(
    `https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`,
    { headers },
  );
  if (!response.ok) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      return fetchTree(repo, attempt + 1);
    }
    console.warn(`  ! ${repo}: HTTP ${response.status}, skipping system`);
    return null;
  }
  const body = await response.json();
  if (body.truncated) console.warn(`  ! ${repo}: tree truncated, matches may be incomplete`);
  return body.tree ?? null;
}

function indexSystem(tree) {
  // normalized title -> { snap, title } picking the best region per folder.
  const index = new Map();
  for (const entry of tree) {
    const match = /^(Named_Snaps|Named_Titles)\/(.+)\.png$/.exec(entry.path);
    if (!match) continue;
    const [, folder, name] = match;
    const key = normalizeTitle(name);
    if (!key) continue;
    const slot = folder === 'Named_Snaps' ? 'snap' : 'title';
    const existing = index.get(key) ?? {};
    if (!existing[slot] || regionScore(name) < regionScore(existing[slot])) {
      existing[slot] = `${name}.png`;
    }
    index.set(key, existing);
  }
  return index;
}

function lookup(index, game) {
  const candidates = [ALIASES[game.gameKey], game.gameTitle, game.gameShortTitle].filter(Boolean);
  for (const candidate of candidates) {
    const hit = index.get(normalizeTitle(candidate));
    if (hit) return { hit, exact: true };
  }
  // Fallback: prefix match, tightest first. A file name extending our title
  // (subtitle drift, "Special Pikachu Edition") gets more slack than our
  // title extending a file name, where overreach could hit the wrong game.
  const want = normalizeTitle(game.gameTitle);
  let best = null;
  for (const [key, hit] of index) {
    const forward = key.startsWith(want);
    if (!forward && !want.startsWith(key)) continue;
    const slack = Math.abs(key.length - want.length);
    if (slack > (forward ? 26 : 16)) continue;
    if (!best || slack < best.slack) best = { hit, slack, key };
  }
  return best ? { hit: best.hit, exact: false, via: best.key } : null;
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const games = new Map();
for (const project of catalog) {
  if (!games.has(project.gameKey)) {
    games.set(project.gameKey, {
      gameKey: project.gameKey,
      gameTitle: project.gameTitle,
      gameShortTitle: project.gameShortTitle,
      platforms: project.originalPlatforms,
    });
  }
}

const systems = new Map();
for (const game of games.values()) {
  for (const platform of game.platforms) {
    const repo = SYSTEM_REPOS[platform];
    if (repo && !systems.has(repo)) systems.set(repo, null);
  }
}
for (const repo of Object.values(EXTRA_SYSTEMS)) {
  if (!systems.has(repo)) systems.set(repo, null);
}

console.log(`Fetching ${systems.size} system trees…`);
for (const repo of systems.keys()) {
  const tree = await fetchTree(repo);
  systems.set(repo, tree ? indexSystem(tree) : null);
  console.log(`  ${repo}: ${systems.get(repo)?.size ?? 0} titles`);
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const output = {};
let matched = 0;
const misses = [];
const fuzzy = [];

for (const [gameKey, game] of games) {
  let found = null;
  let foundRepo = null;
  const repos = game.platforms.map((platform) => SYSTEM_REPOS[platform]);
  if (EXTRA_SYSTEMS[gameKey]) repos.push(EXTRA_SYSTEMS[gameKey]);
  for (const repo of repos) {
    const index = repo ? systems.get(repo) : null;
    if (!index) continue;
    const result = lookup(index, game);
    if (result) {
      found = result;
      foundRepo = repo;
      break;
    }
  }
  if (found) {
    const base = `https://raw.githubusercontent.com/libretro-thumbnails/${foundRepo}/master`;
    const urls = [];
    if (found.hit.snap) urls.push(`${base}/Named_Snaps/${encodeURIComponent(found.hit.snap)}`);
    if (found.hit.title) urls.push(`${base}/Named_Titles/${encodeURIComponent(found.hit.title)}`);
    output[gameKey] = urls;
    matched += 1;
    if (!found.exact) fuzzy.push(`${gameKey} -> ${found.via}`);
  } else if (previous[gameKey]) {
    output[gameKey] = previous[gameKey];
    misses.push(gameKey);
  } else {
    misses.push(gameKey);
  }
}

writeFileSync(OUT, `${JSON.stringify(output, null, 1)}\n`);
console.log(`\nMatched ${matched}/${games.size} games with libretro captures.`);
if (fuzzy.length > 0) console.log(`Fuzzy matches (review):\n  ${fuzzy.join('\n  ')}`);
if (misses.length > 0) console.log(`No libretro match (kept prior shots):\n  ${misses.join('\n  ')}`);
