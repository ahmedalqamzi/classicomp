import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import * as appModule from './App';
import { createBrowserBridge } from './platform/browser-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('Classicomp desktop shell', () => {
  it('loads the library with its primary navigation and local-only save status', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    expect(await screen.findByRole('heading', { name: 'OpenRCT2' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Catalog' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Mods' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /Downloads/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Local only')[0]).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('No active downloads');
  });

  it('uses dense launcher chrome instead of marketing labels and repeated state badges', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    render(<App bridge={createBrowserBridge(new MemoryStorage())} />);

    expect(await screen.findByRole('heading', { name: 'OpenRCT2' })).toBeVisible();
    expect(screen.queryByText('Desktop client', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryAllByText(/^available$/i)).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Not installed' })).toBeVisible();
  });

  it('queues a catalog game and shows it in the downloads bar', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('tab', { name: 'Catalog' }));
    await user.click(screen.getByRole('button', { name: 'Queue DevilutionX install' }));

    expect(screen.getByRole('tab', { name: 'Catalog' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Downloads (1)');
    const queue = screen.getByLabelText('Download queue');
    expect(queue).toBeVisible();
    expect(within(queue).getByText('DevilutionX')).toBeVisible();
    expect(JSON.parse(storage.getItem('classicomp.app-state.v2') ?? '{}').downloads).toHaveLength(1);
  });

  it('signs out to the sign-in screen and back in as another profile', async () => {
    const App = (appModule as { App?: typeof import('./App')['App'] }).App;
    expect(typeof App).toBe('function');
    if (!App) return;

    const user = userEvent.setup();
    const storage = new MemoryStorage();
    render(<App bridge={createBrowserBridge(storage)} />);

    await screen.findByRole('heading', { name: 'OpenRCT2' });
    await user.click(screen.getByRole('button', { name: /The Dictator/ }));
    await user.click(screen.getByRole('menuitem', { name: /Sign out/ }));

    expect(await screen.findByRole('heading', { name: 'Sign in to Classicomp' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Library' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Guest/ }));
    expect(await screen.findByRole('heading', { name: 'OpenRCT2' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Guest/ })).toBeVisible();
  });
});
