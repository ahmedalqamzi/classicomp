// Donate link for the storefront owner: a PayPal.me handle or a full https
// donate URL, stored on this device only (same pattern as the IGDB
// credentials). The header shows a Donate button once a link is saved.

const DONATE_KEY = 'classicomp.donate-url';

// Accepts a bare PayPal.me handle ("myname"), a pasted "paypal.me/myname",
// or any full https URL (PayPal hosted donate buttons live on
// www.paypal.com/donate). Insecure http and anything unrecognizable are
// rejected rather than guessed at.
export function normalizeDonateUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return null;
  const handle = trimmed.replace(/^(www\.)?paypal\.me\//i, '').replace(/^@/, '');
  if (!/^[a-zA-Z0-9._-]+$/.test(handle)) return null;
  return `https://paypal.me/${handle}`;
}

export function getDonateUrl(storage: Storage = window.localStorage): string | null {
  try {
    const stored = storage.getItem(DONATE_KEY);
    if (!stored) return null;
    return normalizeDonateUrl(stored);
  } catch {
    return null;
  }
}

// Saves the normalized link and returns it; an empty input clears the link
// (the header button disappears). Invalid input saves nothing and returns
// null so the dialog can keep the field open.
export function saveDonateUrl(
  input: string,
  storage: Storage = window.localStorage,
): string | null {
  if (input.trim() === '') {
    storage.removeItem(DONATE_KEY);
    return null;
  }
  const normalized = normalizeDonateUrl(input);
  if (normalized) storage.setItem(DONATE_KEY, normalized);
  return normalized;
}
