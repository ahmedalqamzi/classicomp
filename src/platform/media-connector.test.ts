import { describe, expect, it } from 'vitest';
import * as mediaModule from './media-connector';

function fakeFetch(routes: Record<string, unknown>) {
  const requested: string[] = [];
  const fetchFn = async (url: string) => {
    requested.push(url);
    const body = routes[url];
    return { ok: body !== undefined, json: async () => body };
  };
  return { fetchFn, requested };
}

describe('game media connector', () => {
  it('combines Steam HD screenshots with validated Wikipedia covers', async () => {
    const { fetchFn } = fakeFetch({
      'https://en.wikipedia.org/api/rest_v1/page/summary/Perfect_Dark': {
        type: 'standard',
        extract: 'Perfect Dark is a first-person shooter video game.',
        originalimage: {
          source: 'https://upload.wikimedia.org/pd-n64-na.jpg',
          width: 640,
          height: 466,
        },
      },
      'https://steamcommunity.com/actions/SearchApps/Perfect%20Dark': [
        { appid: '42', name: 'Perfect Dark' },
      ],
      'https://store.steampowered.com/api/appdetails?appids=42&filters=screenshots': {
        42: {
          success: true,
          data: {
            screenshots: [
              { path_full: 'https://shared.akamai.steamstatic.com/apps/42/ss_1.jpg' },
              { path_full: 'https://shared.akamai.steamstatic.com/apps/42/ss_2.jpg' },
            ],
          },
        },
      },
    });

    const media = await mediaModule.lookupGameMedia('Perfect Dark', 'Perfect Dark', fetchFn);
    // The landscape N64 image is not named as a box, so it is rejected; the
    // Steam gallery carries the screenshots.
    expect(media).toEqual({
      coverUrl: null,
      coverAspect: null,
      screenshots: [
        'https://shared.akamai.steamstatic.com/apps/42/ss_1.jpg',
        'https://shared.akamai.steamstatic.com/apps/42/ss_2.jpg',
      ],
    });
  });

  it('prefers IGDB screenshots over Steam when credentials are configured', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://id.twitch.tv/oauth2/token?client_id=cid&client_secret=sec&grant_type=client_credentials':
        { access_token: 'tok', expires_in: 5000 },
      'https://api.igdb.com/v4/games': [
        { name: 'Blue Dragon', screenshots: [{ image_id: 'bd1' }, { image_id: 'bd2' }] },
      ],
    });

    const media = await mediaModule.lookupGameMedia('Blue Dragon', 'Blue Dragon', fetchFn, false, {
      clientId: 'cid',
      clientSecret: 'sec',
    });
    expect(media.screenshots).toEqual([
      'https://images.igdb.com/igdb/image/upload/t_1080p/bd1.jpg',
      'https://images.igdb.com/igdb/image/upload/t_1080p/bd2.jpg',
    ]);
    expect(requested.some((url) => url.includes('steam'))).toBe(false);
  });

  it('falls back to Steam when IGDB has no matching gallery', async () => {
    const { fetchFn } = fakeFetch({
      'https://id.twitch.tv/oauth2/token?client_id=cid&client_secret=sec&grant_type=client_credentials':
        { access_token: 'tok', expires_in: 5000 },
      'https://api.igdb.com/v4/games': [{ name: 'Some Other Game', screenshots: [{ image_id: 'x' }] }],
      'https://steamcommunity.com/actions/SearchApps/Perfect%20Dark': [
        { appid: '42', name: 'Perfect Dark' },
      ],
      'https://store.steampowered.com/api/appdetails?appids=42&filters=screenshots': {
        42: {
          success: true,
          data: { screenshots: [{ path_full: 'https://shared.akamai.steamstatic.com/ss_1.jpg' }] },
        },
      },
    });

    const media = await mediaModule.lookupGameMedia('Perfect Dark', 'Perfect Dark', fetchFn, false, {
      clientId: 'cid',
      clientSecret: 'sec',
    });
    expect(media.screenshots).toEqual(['https://shared.akamai.steamstatic.com/ss_1.jpg']);
  });

  it('rejects Steam results whose names do not match the game', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://steamcommunity.com/actions/SearchApps/Animal%20Forest': [
        { appid: '9', name: 'Completely Different Game' },
      ],
    });

    const media = await mediaModule.lookupGameMedia('Animal Forest', 'Animal Forest', fetchFn);
    expect(media.screenshots).toEqual([]);
    expect(requested.some((url) => url.includes('appdetails'))).toBe(false);
  });

  it('falls back to Wikipedia page images when Steam has nothing', async () => {
    const { fetchFn, requested } = fakeFetch({
      'https://en.wikipedia.org/api/rest_v1/page/summary/Perfect_Dark': {
        type: 'standard',
        extract: 'Perfect Dark is a first-person shooter video game.',
        thumbnail: {
          source: 'https://upload.wikimedia.org/pd-boxart.jpg',
          width: 250,
          height: 356,
        },
      },
    });

    const media = await mediaModule.lookupGameMedia('Perfect Dark', 'Perfect Dark', fetchFn);
    expect(media).toEqual({
      coverUrl: 'https://upload.wikimedia.org/pd-boxart.jpg',
      coverAspect: 250 / 356,
      screenshots: [],
    });
    expect(requested.some((url) => url.includes('wikipedia'))).toBe(true);
  });

  it('refuses non-game Wikipedia pages and retries the (video game) title', async () => {
    const { fetchFn } = fakeFetch({
      'https://en.wikipedia.org/api/rest_v1/page/summary/Doom': {
        type: 'standard',
        extract: 'Doom is a concept of impending destruction.',
      },
      'https://en.wikipedia.org/api/rest_v1/page/summary/Doom_(video_game)': {
        type: 'standard',
        extract: 'Doom is a 1993 first-person shooter video game.',
        originalimage: {
          source: 'https://upload.wikimedia.org/doom.jpg',
          width: 256,
          height: 380,
        },
      },
    });

    const media = await mediaModule.lookupGameMedia('Doom', 'Doom', fetchFn);
    expect(media.coverUrl).toBe('https://upload.wikimedia.org/doom.jpg');
  });

  it('rejects junk covers and accepts landscape images only when named as boxes', () => {
    expect(
      mediaModule.validateCover('https://x/scummvm_gui_screenshot.png', 640, 480),
    ).toBeNull();
    expect(mediaModule.validateCover('https://x/game-logo.png', 300, 420)).toBeNull();
    expect(mediaModule.validateCover('https://x/banjo-kazooie-boxart.jpg', 640, 466)).toEqual({
      coverUrl: 'https://x/banjo-kazooie-boxart.jpg',
      coverAspect: 640 / 466,
    });
    expect(mediaModule.validateCover('https://x/random-landscape.jpg', 640, 466)).toBeNull();
    expect(mediaModule.validateCover('https://x/mm64.jpg', 300, 420)).toEqual({
      coverUrl: 'https://x/mm64.jpg',
      coverAspect: 300 / 420,
    });
    // Junk terms must not fire inside larger words.
    expect(
      mediaModule.validateCover('https://x/Guitar_Hero_II_Game_Cover.jpg', 250, 354),
    ).toEqual({
      coverUrl: 'https://x/Guitar_Hero_II_Game_Cover.jpg',
      coverAspect: 250 / 354,
    });
    expect(
      mediaModule.validateCover('https://x/Silicon_Valley_N64_box.jpg', 640, 466),
    ).toEqual({
      coverUrl: 'https://x/Silicon_Valley_N64_box.jpg',
      coverAspect: 640 / 466,
    });
  });

  it('pulls gameplay screenshots from the Wikipedia article media list', async () => {
    const { fetchFn } = fakeFetch({
      'https://en.wikipedia.org/api/rest_v1/page/summary/Perfect_Dark': {
        type: 'standard',
        extract: 'Perfect Dark is a video game.',
        originalimage: {
          source: 'https://upload.wikimedia.org/pd-box.jpg',
          width: 250,
          height: 356,
        },
      },
      'https://en.wikipedia.org/api/rest_v1/page/media-list/Perfect_Dark': {
        items: [
          {
            type: 'image',
            title: 'File:Perfect_Dark_box.jpg',
            srcset: [{ src: '//upload.wikimedia.org/pd-box.jpg' }],
          },
          {
            type: 'image',
            title: 'File:Perfect_Dark_gameplay.jpg',
            srcset: [{ src: '//upload.wikimedia.org/pd-gameplay.jpg' }],
          },
          {
            type: 'image',
            title: 'File:Rare_logo.svg',
            srcset: [{ src: '//upload.wikimedia.org/rare-logo.svg' }],
          },
        ],
      },
    });

    const media = await mediaModule.lookupGameMedia('Perfect Dark', 'Perfect Dark', fetchFn);
    expect(media.coverUrl).toBe('https://upload.wikimedia.org/pd-box.jpg');
    expect(media.screenshots).toEqual(['https://upload.wikimedia.org/pd-gameplay.jpg']);
  });

});
