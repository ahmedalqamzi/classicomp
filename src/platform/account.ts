import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Friend } from '../domain/types';

// Optional Classicomp account backed by the user's own Supabase project
// (schema in docs/account-setup.md). Everything degrades gracefully when no
// project is configured or the network is down — the app stays fully local.

export interface AccountConfig {
  url: string;
  anonKey: string;
}

const CONFIG_KEY = 'classicomp.account.config';

type ClientFactory = (url: string, anonKey: string) => SupabaseClient;

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export function getAccountConfig(storage: Storage = window.localStorage): AccountConfig | null {
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountConfig>;
    if (typeof parsed.url !== 'string' || typeof parsed.anonKey !== 'string') return null;
    if (!parsed.url.startsWith('https://')) return null;
    return { url: parsed.url, anonKey: parsed.anonKey };
  } catch {
    return null;
  }
}

export function saveAccountConfig(
  config: AccountConfig,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(CONFIG_KEY, JSON.stringify(config));
  cachedClient = null;
  cachedConfigKey = '';
}

export function accountClient(
  storage: Storage = window.localStorage,
  factory: ClientFactory = (url, key) => createClient(url, key),
): SupabaseClient | null {
  const config = getAccountConfig(storage);
  if (!config) return null;
  const key = `${config.url}|${config.anonKey}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = factory(config.url, config.anonKey);
    cachedConfigKey = key;
  }
  return cachedClient;
}

export interface AccountSession {
  email: string;
  userId: string;
}

export async function currentSession(
  client: SupabaseClient | null,
): Promise<AccountSession | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user?.email) return null;
    return { email: user.email, userId: user.id };
  } catch {
    return null;
  }
}

export async function signIn(
  client: SupabaseClient,
  email: string,
  password: string,
  mode: 'signIn' | 'signUp',
): Promise<{ session: AccountSession | null; error: string | null }> {
  try {
    const { data, error } =
      mode === 'signUp'
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
    if (error) return { session: null, error: error.message };
    const user = data.user;
    if (!user?.email) {
      return {
        session: null,
        error: mode === 'signUp' ? 'Check your inbox to confirm the account.' : 'Sign-in failed.',
      };
    }
    await client.from('profiles').upsert({ user_id: user.id, email: user.email });
    return { session: { email: user.email, userId: user.id }, error: null };
  } catch (error) {
    return { session: null, error: error instanceof Error ? error.message : 'Sign-in failed.' };
  }
}

export async function signOut(client: SupabaseClient): Promise<void> {
  try {
    await client.auth.signOut();
  } catch {
    // Local session state is cleared by the caller regardless.
  }
}

// Wishlist sync is last-write-wins per user: the local wishlist is the truth
// the moment the user toggles it.
export async function syncWishlist(
  client: SupabaseClient,
  userId: string,
  gameKeys: string[],
): Promise<void> {
  try {
    await client.from('wishlists').delete().eq('user_id', userId);
    if (gameKeys.length > 0) {
      await client
        .from('wishlists')
        .insert(gameKeys.map((gameKey) => ({ user_id: userId, game_key: gameKey })));
    }
  } catch {
    // Offline sync failures are silent; the local wishlist stays authoritative.
  }
}

interface FriendshipRow {
  id: string;
  status: string;
  requester_id: string;
  addressee_id: string;
  requester: { email: string | null; display_name: string | null } | null;
  addressee: { email: string | null; display_name: string | null } | null;
}

export async function fetchFriends(
  client: SupabaseClient,
  userId: string,
): Promise<{ friends: Friend[]; pending: Friend[]; error: string | null }> {
  try {
    const { data, error } = await client
      .from('friendships')
      .select(
        'id, status, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(email, display_name), addressee:profiles!friendships_addressee_id_fkey(email, display_name)',
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) return { friends: [], pending: [], error: error.message };

    const friends: Friend[] = [];
    const pending: Friend[] = [];
    for (const row of (data ?? []) as unknown as FriendshipRow[]) {
      const otherProfile = row.requester_id === userId ? row.addressee : row.requester;
      const email = otherProfile?.email ?? 'unknown';
      const friend: Friend = {
        id: row.id,
        displayName: otherProfile?.display_name ?? email,
        email,
        status: row.status === 'accepted' ? 'offline' : 'pending',
      };
      (row.status === 'accepted' ? friends : pending).push(friend);
    }
    return { friends, pending, error: null };
  } catch (error) {
    return {
      friends: [],
      pending: [],
      error: error instanceof Error ? error.message : 'Could not load friends.',
    };
  }
}

export async function addFriend(
  client: SupabaseClient,
  userId: string,
  friendEmail: string,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('user_id')
      .eq('email', friendEmail)
      .maybeSingle();
    if (error) return error.message;
    if (!data) return 'No Classicomp account uses that email.';
    if (data.user_id === userId) return 'That is your own account.';
    const { error: insertError } = await client
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: data.user_id, status: 'pending' });
    return insertError ? insertError.message : null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not send the request.';
  }
}
