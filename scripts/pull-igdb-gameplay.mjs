// Fills scripts/pulled-gameplay.json for games libretro-thumbnails does not
// cover (Xbox 360, iOS, prototypes) with real IGDB screenshots, honoring the
// contract generate-tracked-catalog.mjs documents for that file.
//
// Usage:
//   CLASSICOMP_IGDB_ID=... CLASSICOMP_IGDB_SECRET=... node scripts/pull-igdb-gameplay.mjs
//
// Only games whose current entry has no verified gameplay source (libretro
// snap, Steam store shot, or IGDB shot) are touched; everything else is kept
// byte-for-byte. A game the lookup cannot confidently match is left alone and
// reported, never guessed.

import { readFileSync, writeFileSync } from 'node:fs';

const CATALOG = new URL('../src/data/tracked-projects.json', import.meta.url).pathname;
const GAMEPLAY = new URL('./pulled-gameplay.json', import.meta.url).pathname;

const clientId = process.env.CLASSICOMP_IGDB_ID;
const secret = process.env.CLASSICOMP_IGDB_SECRET;
if (!clientId || !secret) {
  console.error('Set CLASSICOMP_IGDB_ID and CLASSICOMP_IGDB_SECRET (kept local, never committed).');
  process.exit(1);
}

const REAL_SHOT = /libretro|steamstatic\.com|images\.igdb\.com/;
const VIDEO_STILL = /i\.ytimg\.com|img\.youtube\.com/;
const MAX_IGDB_SHOTS = 6;

// Games whose catalog title will not match their IGDB entry directly.
// Each override lists search terms to try in order, with an optional year
// replacing the catalog year for the ±1 gate (null disables the gate — used
// only where the term is specific enough to be unambiguous).
const SEARCH_OVERRIDES = {
  // ScummVM: honest gameplay is a flagship game the engine runs, same year
  // as the catalog entry (1990).
  'classic-adventure-engines': [{ term: 'The Secret of Monkey Island', year: 1990 }],
  // The demo entries: prefer the demo's own IGDB entry when one exists,
  // otherwise the game the demo is of (identical gameplay footage).
  'sonic-the-hedgehog-2006-demo': [{ term: 'Sonic the Hedgehog', year: 2006 }],
  'pokemon-gold-space-world-demo': [
    { term: 'Spaceworld 1997 Demo', year: null },
    { term: 'Space World 1997', year: null },
  ],
};

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanTitle(title) {
  return title.replace(/\s*\([^)]*\)/g, '').trim();
}

async function igdbToken() {
  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST' },
  );
  if (!response.ok) throw new Error(`token request failed: ${response.status}`);
  const payload = await response.json();
  return payload.access_token;
}

async function searchIgdb(token, term) {
  const response = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: `search "${term.replace(/"/g, '')}"; fields name,first_release_date,screenshots.image_id; limit 10;`,
  });
  if (!response.ok) throw new Error(`igdb search failed: ${response.status}`);
  return response.json();
}

function candidateYear(candidate) {
  if (!candidate.first_release_date) return null;
  return new Date(candidate.first_release_date * 1000).getUTCFullYear();
}

function pickCandidate(candidates, term, year) {
  const withShots = candidates.filter((c) => (c.screenshots ?? []).length > 0);
  const wanted = normalize(term);
  const exactName = (c) => normalize(c.name) === wanted;
  if (year === null) return withShots.find(exactName) ?? null;
  // Candidates dated within ±1 of the catalog year outrank dateless
  // exact-name hits — a dateless entry is often a fan port or re-release.
  const yearMatches = withShots.filter((c) => {
    const cYear = candidateYear(c);
    return cYear !== null && Math.abs(cYear - year) <= 1;
  });
  return (
    yearMatches.find(exactName) ??
    yearMatches[0] ??
    withShots.find((c) => exactName(c) && candidateYear(c) === null) ??
    null
  );
}

function shotUrls(candidate) {
  return (candidate.screenshots ?? [])
    .map((shot) => shot.image_id)
    .filter(Boolean)
    .slice(0, MAX_IGDB_SHOTS)
    .map((id) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`);
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const projects = Array.isArray(catalog) ? catalog : catalog.projects ?? catalog;
const games = new Map();
for (const project of projects) {
  const key = project.gameKey;
  if (!key || games.has(key)) continue;
  games.set(key, {
    title: project.gameTitle,
    shortTitle: project.gameShortTitle ?? project.gameTitle,
    year: project.originalReleaseYear > 0 ? project.originalReleaseYear : null,
  });
}

const gameplay = JSON.parse(readFileSync(GAMEPLAY, 'utf8'));
const targets = [...games.keys()].filter((key) => {
  const entry = gameplay[key] ?? [];
  return !entry.some((url) => REAL_SHOT.test(url));
});
console.log(`targets without verified gameplay: ${targets.length}`);

const token = await igdbToken();
const misses = [];
for (const key of targets) {
  const game = games.get(key);
  const attempts = SEARCH_OVERRIDES[key] ?? [
    { term: cleanTitle(game.title), year: game.year },
    { term: cleanTitle(game.shortTitle), year: game.year },
  ];
  let picked = null;
  for (const attempt of attempts) {
    const results = await searchIgdb(token, attempt.term);
    picked = pickCandidate(results, attempt.term, attempt.year);
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (picked) {
      console.log(`  ${key} -> ${picked.name} (${candidateYear(picked) ?? '?'}) · ${(picked.screenshots ?? []).length} shots`);
      break;
    }
  }
  if (!picked) {
    misses.push(key);
    console.log(`  ${key} -> NO MATCH, left untouched`);
    continue;
  }
  const igdbShots = shotUrls(picked);
  const kept = (gameplay[key] ?? []).filter((url) => REAL_SHOT.test(url));
  const stills = (gameplay[key] ?? []).filter((url) => VIDEO_STILL.test(url));
  // Real shots lead; video stills survive only when we still have under 3.
  const merged = [...new Set([...igdbShots, ...kept])];
  gameplay[key] = merged.length >= 3 ? merged : [...merged, ...stills];
}

writeFileSync(GAMEPLAY, `${JSON.stringify(gameplay, null, 2)}\n`);
console.log(`done. matched ${targets.length - misses.length}/${targets.length}; misses: ${misses.join(', ') || 'none'}`);
