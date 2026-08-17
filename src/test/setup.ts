import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Tests must never reach real tracking sources; the collector receives an
// explicit fetch stub in the tests that exercise it. Store downloads open
// external release pages, which jsdom does not implement.
vi.stubGlobal('fetch', () => Promise.reject(new Error('network disabled in tests')));
vi.stubGlobal('open', vi.fn());

// This jsdom build ships no window.localStorage; the app's device-local
// settings (IGDB credentials, donate link) expect one. A fresh in-memory
// stand-in per test keeps them isolated.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  writable: true,
  value: memoryStorage(),
});

afterEach(() => {
  cleanup();
  (window as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});
