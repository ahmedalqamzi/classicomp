import { describe, expect, it } from 'vitest';
import { getDonateUrl, normalizeDonateUrl, saveDonateUrl } from './donate';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('donate link', () => {
  it('normalizes bare PayPal.me handles and pasted variants', () => {
    expect(normalizeDonateUrl('myname')).toBe('https://paypal.me/myname');
    expect(normalizeDonateUrl('@myname')).toBe('https://paypal.me/myname');
    expect(normalizeDonateUrl('paypal.me/MyName')).toBe('https://paypal.me/MyName');
    expect(normalizeDonateUrl('www.paypal.me/myname')).toBe('https://paypal.me/myname');
    expect(normalizeDonateUrl('  myname  ')).toBe('https://paypal.me/myname');
  });

  it('keeps full https links as-is (hosted PayPal donate buttons)', () => {
    expect(normalizeDonateUrl('https://www.paypal.com/donate?hosted_button_id=ABC')).toBe(
      'https://www.paypal.com/donate?hosted_button_id=ABC',
    );
  });

  it('rejects insecure and malformed input instead of guessing', () => {
    expect(normalizeDonateUrl('http://paypal.me/myname')).toBeNull();
    expect(normalizeDonateUrl('not a handle')).toBeNull();
    expect(normalizeDonateUrl('')).toBeNull();
  });

  it('round-trips through storage and clears on empty input', () => {
    const storage = new MemoryStorage();
    expect(getDonateUrl(storage)).toBeNull();
    expect(saveDonateUrl('myname', storage)).toBe('https://paypal.me/myname');
    expect(getDonateUrl(storage)).toBe('https://paypal.me/myname');
    // Invalid input saves nothing and keeps the existing link.
    expect(saveDonateUrl('not a handle', storage)).toBeNull();
    expect(getDonateUrl(storage)).toBe('https://paypal.me/myname');
    expect(saveDonateUrl('', storage)).toBeNull();
    expect(getDonateUrl(storage)).toBeNull();
  });
});
