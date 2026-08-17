import type { Game, LiveMod } from '../domain/types';
import type { FetchLike } from './tracking-collector';

// Live mod discovery: each built-in game maps to several GitHub repository
// searches, because no single phrase covers an ecosystem's vocabulary — an
// OpenMW add-on may never say "mod" while advertising itself as an omwaddon,
// and an OpenTTD add-on calls itself a NewGRF or a game script. Results are
// fetched when the Mods tab is opened and cached for the session; failures
// degrade to the bundled list.
//
// The lists stay short on purpose: every entry is one more search request
// against GitHub's unauthenticated budget, and a query that trips the limit
// silently loses its slice of the catalogue.

const MOD_QUERIES: Record<string, string[]> = {
  openmw: [
    'openmw mod in:name,description,topics',
    'morrowind mod in:name,description,topics',
    'omwaddon in:name,description,readme',
    'tes3 mod in:name,description,topics',
  ],
  openrct2: [
    'openrct2 plugin in:name,description,topics',
    'openrct2 object in:name,description,topics',
    'openrct2 scenario in:name,description,topics',
    'rollercoaster tycoon mod in:name,description,topics',
  ],
  devilutionx: [
    'devilutionx mod in:name,description,topics',
    'diablo 1 mod in:name,description,topics',
    'diablo mpq in:name,description,topics',
    'hellfire mod in:name,description,topics',
  ],
  openttd: [
    'openttd newgrf in:name,description,topics',
    'openttd game script in:name,description,topics',
    'openttd ai in:name,description,topics',
    'transport tycoon mod in:name,description,topics',
  ],
  scummvm: [
    'scummvm engine in:name,description,topics',
    'scummvm game data in:name,description,topics',
    'scummvm translation in:name,description,topics',
    'scummvm tools in:name,description,topics',
  ],
  soh: [
    'ship of harkinian mod in:name,description,topics',
    'ocarina of time randomizer in:name,description,topics',
    'ocarina of time texture pack in:name,description,topics',
    'ship of harkinian otr in:name,description,topics',
  ],
  zelda64recompiled: [
    'zelda64recomp mod in:name,description,topics',
    "majora's mask recomp mod in:name,description,topics",
    'majora mask randomizer in:name,description,topics',
    'n64 recomp mod in:name,description,topics',
  ],
};

interface SearchRepo {
  full_name?: string;
  name?: string;
  description?: string | null;
  html_url?: string;
  pushed_at?: string | null;
  stargazers_count?: number;
  owner?: { login?: string };
}

// User-added mod repositories (recomp-tool style): stored on this device,
// fetched ahead of the search results so they always appear for their game.
export interface ModRepoSource {
  gameId: string;
  repo: string;
}

const MOD_REPOS_KEY = 'classicomp.mod-repos';

// Accepts "owner/name", a full GitHub URL, or a .git clone URL; anything
// else is rejected rather than guessed at.
export function normalizeModRepo(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(trimmed) ? trimmed : null;
}

export function getModRepos(storage?: Storage): ModRepoSource[] {
  try {
    const store = storage ?? window.localStorage;
    const raw = store.getItem(MOD_REPOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ModRepoSource =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ModRepoSource).gameId === 'string' &&
        typeof (entry as ModRepoSource).repo === 'string',
    );
  } catch {
    return [];
  }
}

export function saveModRepos(repos: ModRepoSource[], storage?: Storage): void {
  try {
    const store = storage ?? window.localStorage;
    store.setItem(MOD_REPOS_KEY, JSON.stringify(repos));
  } catch {
    // Device without storage: sources simply don't persist.
  }
}

function toLiveMod(gameId: string, repo: SearchRepo): LiveMod | null {
  if (!repo.full_name || !repo.html_url || !repo.name) return null;
  return {
    id: `${gameId}-${repo.full_name}`,
    gameId,
    name: repo.name,
    summary: repo.description?.trim() || 'No description published.',
    url: repo.html_url,
    author: repo.owner?.login ?? repo.full_name.split('/')[0],
    stars: repo.stargazers_count ?? 0,
    updatedAt: repo.pushed_at ?? null,
  };
}

export async function collectLiveMods(
  games: Game[],
  fetchFn: FetchLike = (url) => fetch(url),
  extraRepos: ModRepoSource[] = getModRepos(),
): Promise<LiveMod[]> {
  const mods: LiveMod[] = [];
  const seenUrls = new Set<string>();
  const gameIds = new Set(games.map((game) => game.id));

  // User-added repositories come first: they were pinned by hand, so they
  // lead their game's list and are never displaced by search ranking.
  for (const source of extraRepos) {
    if (!gameIds.has(source.gameId)) continue;
    try {
      const response = await fetchFn(`https://api.github.com/repos/${source.repo}`);
      if (!response.ok) continue;
      const repo = (await response.json()) as SearchRepo;
      const mod = toLiveMod(source.gameId, repo);
      if (mod && !seenUrls.has(mod.url)) {
        seenUrls.add(mod.url);
        mods.push(mod);
      }
    } catch {
      // An unreachable pinned repo just doesn't list this session.
    }
  }

  // Round-robin the sweep instead of finishing one game before starting the
  // next: a full sweep asks for more searches than GitHub grants an anonymous
  // caller per minute, and running game by game would spend the whole budget
  // on the first few and leave the last ones looking like they have no mods at
  // all. Every game's leading phrase — its most specific one — goes out before
  // any game's second, so an exhausted budget costs the long tail evenly.
  const searchable = games.filter((game) => MOD_QUERIES[game.id]);
  const rounds = Math.max(0, ...searchable.map((game) => MOD_QUERIES[game.id].length));
  let budgetExhausted = false;

  for (let round = 0; round < rounds && !budgetExhausted; round += 1) {
    for (const game of searchable) {
      const query = MOD_QUERIES[game.id][round];
      if (!query) continue;
      try {
        const response = await fetchFn(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=8`,
        );
        if (!response.ok) {
          // GitHub answers an exhausted search budget with 403, and it stays
          // exhausted for the rest of the minute — every further request would
          // fail anyway while still costing a round trip the Mods tab waits on.
          // FetchResponseLike promises no status field, so read it defensively
          // rather than widening the shared fetch contract for this one case.
          if ((response as { status?: number }).status === 403) {
            budgetExhausted = true;
            break;
          }
          continue;
        }
        const body = (await response.json()) as { items?: SearchRepo[] };
        // Overlapping phrases are the point: the same popular repo answers
        // several of them, so the shared seenUrls set decides where it lands.
        for (const repo of body.items ?? []) {
          const mod = toLiveMod(game.id, repo);
          if (mod && !seenUrls.has(mod.url)) {
            seenUrls.add(mod.url);
            mods.push(mod);
          }
        }
      } catch {
        // A single failed search only costs its own phrase; the game keeps
        // whatever its other searches and bundled mods provide.
      }
    }
  }

  return mods;
}
