import type { FetchInit, FetchLike } from './tracking-collector';

// Game media connector used by the scan pipeline: whenever the tracker
// updates the store, missing covers and gameplay screenshots are looked up
// automatically. Sources, in order:
//   - IGDB (Twitch): primary HD source once the user pastes a free Twitch
//     dev app's Client ID + Secret. Catalogs console-only titles — the
//     Xbox 360 exclusives no other keyless source covers.
//   - Steam storefront (keyless search + appdetails): HD screenshots for
//     any game with a Steam release; automatic fallback.
//   - Wikipedia REST (keyless): cover art via page images, tiny fair-use
//     gameplay shots as the last-resort gallery.

export interface GameMedia {
  coverUrl: string | null;
  coverAspect: number | null;
  screenshots: string[];
}

export const EMPTY_MEDIA: GameMedia = { coverUrl: null, coverAspect: null, screenshots: [] };

// Validation rules from the media audit: junk filenames disqualify an image
// outright (substring match, so underscore/dash separators cannot hide them);
// portrait / near-square images (w/h <= 1.05) are box art; landscape images
// qualify only when their name says they are a box or cover (real N64/SNES
// boxes are landscape), otherwise they are screenshots or logos.
const COVER_JUNK_PATTERN =
  /\b(screenshots?|gameplay|logos?|icons?|menu|gui|wallpaper|settings?|svg)\b/;
// Accept pattern stays substring: 'GameCover.jpg' must match 'cover'.
const LANDSCAPE_BOX_PATTERN = /box|cover|packaging|capa|caratula|jaquette|kutu/;
export const COVER_PORTRAIT_MAX_ASPECT = 1.05;

function normalizeMediaName(url: string): string {
  return url.toLowerCase().replace(/[-_./?#%]+/g, ' ');
}

export function validateCover(
  url: string,
  width: number | null,
  height: number | null,
): { coverUrl: string; coverAspect: number | null } | null {
  const name = normalizeMediaName(url);
  if (COVER_JUNK_PATTERN.test(name)) return null;
  if (!width || !height) {
    // Unknown dimensions: only accept when the name declares box art.
    return LANDSCAPE_BOX_PATTERN.test(name) ? { coverUrl: url, coverAspect: null } : null;
  }
  const aspect = width / height;
  if (aspect <= COVER_PORTRAIT_MAX_ASPECT) return { coverUrl: url, coverAspect: aspect };
  if (LANDSCAPE_BOX_PATTERN.test(name)) return { coverUrl: url, coverAspect: aspect };
  return null;
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titlesMatch(candidate: string, gameTitle: string, shortTitle: string): boolean {
  const normalized = normalizeTitle(candidate);
  const full = normalizeTitle(gameTitle);
  const short = normalizeTitle(shortTitle);
  return (
    normalized.includes(short) ||
    short.includes(normalized) ||
    normalized.includes(full) ||
    full.includes(normalized)
  );
}

async function fetchJson(
  fetchFn: FetchLike,
  url: string,
  init?: FetchInit,
): Promise<unknown | null> {
  try {
    const response = await fetchFn(url, init);
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

// ── IGDB (Twitch) ──────────────────────────────────────────────────────

const IGDB_ID_STORAGE = 'classicomp.igdb-client-id';
const IGDB_SECRET_STORAGE = 'classicomp.igdb-secret';
const IGDB_TOKEN_STORAGE = 'classicomp.igdb-token';

export interface IgdbCredentials {
  clientId: string;
  clientSecret: string;
}

export function getIgdbCredentials(storage?: Storage): IgdbCredentials | null {
  try {
    const store = storage ?? window.localStorage;
    const clientId = store.getItem(IGDB_ID_STORAGE)?.trim();
    const clientSecret = store.getItem(IGDB_SECRET_STORAGE)?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  } catch {
    return null;
  }
}

export function saveIgdbCredentials(
  clientId: string,
  clientSecret: string,
  storage?: Storage,
): void {
  const store = storage ?? window.localStorage;
  if (clientId.trim().length === 0 || clientSecret.trim().length === 0) {
    store.removeItem(IGDB_ID_STORAGE);
    store.removeItem(IGDB_SECRET_STORAGE);
  } else {
    store.setItem(IGDB_ID_STORAGE, clientId.trim());
    store.setItem(IGDB_SECRET_STORAGE, clientSecret.trim());
  }
  // Any cached app token belongs to the previous credentials.
  store.removeItem(IGDB_TOKEN_STORAGE);
}

// Twitch app tokens live ~60 days; cache one and refresh a minute early.
async function igdbToken(
  credentials: IgdbCredentials,
  fetchFn: FetchLike,
  storage?: Storage,
): Promise<string | null> {
  let store: Storage | null = null;
  try {
    store = storage ?? window.localStorage;
    const cached = store.getItem(IGDB_TOKEN_STORAGE);
    if (cached) {
      const parsed = JSON.parse(cached) as { token?: string; expiresAt?: number };
      if (parsed.token && (parsed.expiresAt ?? 0) > Date.now() + 60_000) return parsed.token;
    }
  } catch {
    store = null;
  }

  const body = (await fetchJson(
    fetchFn,
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(credentials.clientId)}&client_secret=${encodeURIComponent(credentials.clientSecret)}&grant_type=client_credentials`,
    { method: 'POST' },
  )) as { access_token?: string; expires_in?: number } | null;
  if (!body?.access_token) return null;
  try {
    store?.setItem(
      IGDB_TOKEN_STORAGE,
      JSON.stringify({
        token: body.access_token,
        expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      }),
    );
  } catch {
    // Uncacheable tokens just get re-fetched next scan.
  }
  return body.access_token;
}

async function igdbMedia(
  gameTitle: string,
  shortTitle: string,
  fetchFn: FetchLike,
  credentials: IgdbCredentials,
  releaseYear: number | null = null,
  storage?: Storage,
): Promise<GameMedia | null> {
  const token = await igdbToken(credentials, fetchFn, storage);
  if (!token) return null;

  // Parentheticals ("Spider-Man (2000)") are disambiguators for humans, not
  // search terms; the release year carries that job instead.
  const searchTitle = gameTitle.replace(/\s*\(.*?\)/g, '').replace(/"/g, '').trim();
  const games = (await fetchJson(fetchFn, 'https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': credentials.clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: `search "${searchTitle}"; fields name,first_release_date,screenshots.image_id; limit 10;`,
  })) as Array<{
    name?: string;
    first_release_date?: number | null;
    screenshots?: Array<{ image_id?: string | null }>;
  }> | null;

  // A known release year must match (±1): remakes and reboots share the
  // name, and a 2024 reboot's gallery on a 1992 game's page is worse than
  // no gallery at all.
  const yearMatches = (game: { first_release_date?: number | null }) => {
    if (!releaseYear) return true;
    if (!game.first_release_date) return false;
    const igdbYear = new Date(game.first_release_date * 1000).getUTCFullYear();
    return Math.abs(igdbYear - releaseYear) <= 1;
  };
  const match = (Array.isArray(games) ? games : []).find(
    (game) =>
      game.name &&
      (game.screenshots?.length ?? 0) > 0 &&
      titlesMatch(game.name, gameTitle, shortTitle) &&
      yearMatches(game),
  );
  if (!match) return null;

  const screenshots = (match.screenshots ?? [])
    .map((shot) => shot.image_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 6)
    .map((id) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`);
  return screenshots.length > 0 ? { coverUrl: null, coverAspect: null, screenshots } : null;
}

// Keyless HD gallery: Steam storefront search plus appdetails. Classics
// re-released on Steam get real 1080p+ captures; games never sold there
// return null and the caller falls back to Wikipedia.
async function steamMedia(
  gameTitle: string,
  shortTitle: string,
  fetchFn: FetchLike,
): Promise<GameMedia | null> {
  const search = (await fetchJson(
    fetchFn,
    `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(gameTitle)}`,
  )) as Array<{ appid?: string | number; name?: string }> | null;
  const match = (Array.isArray(search) ? search : []).find(
    (result) => result.name && result.appid && titlesMatch(result.name, gameTitle, shortTitle),
  );
  if (!match?.appid) return null;

  const details = (await fetchJson(
    fetchFn,
    `https://store.steampowered.com/api/appdetails?appids=${match.appid}&filters=screenshots`,
  )) as Record<
    string,
    { success?: boolean; data?: { screenshots?: Array<{ path_full?: string | null }> } }
  > | null;
  const screenshots = (details?.[String(match.appid)]?.data?.screenshots ?? [])
    .map((shot) => shot.path_full)
    .filter((image): image is string => typeof image === 'string')
    .slice(0, 6);
  return screenshots.length > 0 ? { coverUrl: null, coverAspect: null, screenshots } : null;
}

async function wikipediaCover(
  title: string,
  fetchFn: FetchLike,
): Promise<{ coverUrl: string; coverAspect: number | null } | null> {
  const summary = (await fetchJson(
    fetchFn,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
  )) as {
    type?: string;
    extract?: string;
    originalimage?: { source?: string; width?: number; height?: number };
    thumbnail?: { source?: string; width?: number; height?: number };
  } | null;
  if (!summary || summary.type !== 'standard') return null;
  if (!/game/i.test(summary.extract ?? '')) return null;
  const image = summary.originalimage ?? summary.thumbnail;
  if (!image?.source) return null;
  return validateCover(image.source, image.width ?? null, image.height ?? null);
}

// Keyless gameplay screenshots: a game's Wikipedia article usually carries at
// least one true gameplay image beyond the infobox cover.
const WIKI_SHOT_JUNK = /logo|icon|map|cover|box|packaging|\.svg($|\?)|commons-|wiki(media|pedia)?-/i;

async function wikipediaGameplayShots(
  title: string,
  fetchFn: FetchLike,
): Promise<string[]> {
  const media = (await fetchJson(
    fetchFn,
    `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
  )) as {
    items?: Array<{
      type?: string;
      title?: string;
      srcset?: Array<{ src?: string }>;
    }>;
  } | null;
  if (!media?.items) return [];

  const shots: string[] = [];
  for (const item of media.items) {
    if (item.type !== 'image') continue;
    const src = item.srcset?.[0]?.src;
    if (!src) continue;
    const url = src.startsWith('//') ? `https:${src}` : src;
    const name = `${item.title ?? ''} ${url}`;
    if (WIKI_SHOT_JUNK.test(name)) continue;
    if (!/gameplay|screenshot|screen[-_ ]?shot|in[-_ ]?game/i.test(name)) continue;
    shots.push(url);
    if (shots.length >= 3) break;
  }
  return shots;
}

export async function lookupGameMedia(
  gameTitle: string,
  shortTitle: string,
  fetchFn: FetchLike = (url, init) => fetch(url, init),
  wantCover = true,
  igdbCredentials: IgdbCredentials | null = getIgdbCredentials(),
  releaseYear: number | null = null,
): Promise<GameMedia> {
  const cover = wantCover
    ? ((await wikipediaCover(gameTitle, fetchFn)) ??
      (await wikipediaCover(`${gameTitle} (video game)`, fetchFn)))
    : null;

  let screenshots: string[] = [];
  if (igdbCredentials) {
    const igdb = await igdbMedia(gameTitle, shortTitle, fetchFn, igdbCredentials, releaseYear);
    if (igdb) screenshots = igdb.screenshots;
  }
  if (screenshots.length === 0) {
    const steam = await steamMedia(gameTitle, shortTitle, fetchFn);
    if (steam) screenshots = steam.screenshots;
  }
  if (screenshots.length === 0) {
    screenshots = await wikipediaGameplayShots(gameTitle, fetchFn);
  }

  return {
    coverUrl: cover?.coverUrl ?? null,
    coverAspect: cover?.coverAspect ?? null,
    screenshots,
  };
}
