// Keyboard + contrast acceptance gate for the Classicomp a11y wave.
// Usage: node scripts/a11y-acceptance.mjs
// Expects the app at http://localhost:4519 (override with A11Y_BASE_URL).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, 'a11y-tokens.json'), 'utf8'));

const BASE = process.env.A11Y_BASE_URL ?? 'http://localhost:4519';
const TAB_BUDGET = 40;
const AA = 4.5;

const results = [];

function record(id, label, pass, detail) {
  results.push({ id, label, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${id}  ${label}`);
  if (detail) {
    for (const line of String(detail).split('\n')) {
      console.log(`      ${line}`);
    }
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function parseColor(value) {
  const raw = String(value).trim();
  if (raw.startsWith('#')) return hexToRgb(raw);
  const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function relativeLuminance(rgb) {
  const lin = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(fg, bg) {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return 0;
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function describeActive(el) {
  if (!el) return '(none)';
  const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  const cls = typeof el.className === 'string' ? el.className : '';
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/)[0] : ''} "${name.slice(0, 72)}"`;
}

async function describeFocus(page) {
  return page.evaluate(describeActive, await page.evaluateHandle(() => document.activeElement));
}

async function blurFocus(page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
  });
}

async function clickTab(page, name) {
  await page.evaluate((label) => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent.trim() === label,
    );
    if (!tab) throw new Error(`no tab named ${label}`);
    tab.click();
  }, name);
}

async function goStore(page) {
  if (await page.locator('.store-view').count()) return;
  await clickTab(page, 'Store');
  await page.locator('.store-view').waitFor({ timeout: 8_000 });
}

async function ensureLibraryGame(page) {
  await clickTab(page, 'Library');
  if (await page.locator('.game-options').count()) return;

  await clickTab(page, 'Store');
  await page.locator('.store-view').waitFor({ timeout: 8_000 });
  const download = page.getByRole('button', { name: /^Download / }).first();
  if (!(await download.count())) {
    throw new Error('library is empty and no Download button is available to add a game');
  }
  await download.click({ force: true });
  await page.waitForTimeout(800);
  await clickTab(page, 'Library');
  await page.locator('.game-options').waitFor({ timeout: 8_000 });
}

console.log(`Classicomp a11y acceptance  →  ${BASE}`);
console.log('');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('download', (download) => {
  download.cancel().catch(() => {});
});
page.setDefaultTimeout(8_000);

try {
  const response = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if (!response || !response.ok()) {
    throw new Error(`app did not respond OK at ${BASE} (${response?.status() ?? 'no response'})`);
  }
  await page.locator('.app-shell, .sign-in-view').waitFor({ timeout: 15_000 });
  if (await page.locator('.sign-in-view').count()) {
    throw new Error('app is on the profile sign-in screen; expected the signed-in client');
  }
  await goStore(page);
} catch (error) {
  console.error(`SETUP FAIL  ${error.message}`);
  await browser.close();
  process.exit(1);
}

// (a) Skip link is the first Tab stop and moves focus to its target.
try {
  await goStore(page);
  await blurFocus(page);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName,
      href: el.getAttribute('href') || '',
      name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim(),
      describe: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 72)}"`,
    };
  });
  const isSkip =
    first &&
    first.tag === 'A' &&
    first.href.startsWith('#') &&
    /skip/i.test(first.name);
  if (!isSkip) {
    record(
      'a',
      'skip link is the first Tab stop and works',
      false,
      `first Tab landed on ${first?.describe ?? '(nothing)'}; expected an in-page "skip" link`,
    );
  } else {
    const targetSel = first.href;
    await page.keyboard.press('Enter');
    const after = await page.evaluate((sel) => {
      const target = document.querySelector(sel);
      const active = document.activeElement;
      return {
        targetExists: Boolean(target),
        focusMoved: Boolean(
          target && (active === target || target.contains(active)),
        ),
        active: active
          ? `${active.tagName.toLowerCase()}#${active.id || ''} "${(active.getAttribute('aria-label') || active.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)}"`
          : '(none)',
      };
    }, targetSel);
    const pass = after.targetExists && after.focusMoved;
    record(
      'a',
      'skip link is the first Tab stop and works',
      pass,
      pass
        ? `first Tab is "${first.name}" → focus moved to ${after.active}`
        : `skip link "${first.name}" (${targetSel}) did not move focus; target exists=${after.targetExists}; focus=${after.active}`,
    );
  }
} catch (error) {
  record('a', 'skip link is the first Tab stop and works', false, error.message);
}

// (b) Key store controls are reachable within the roving-tabindex budget.
try {
  await goStore(page);
  await blurFocus(page);
  const hits = {};
  for (let i = 1; i <= TAB_BUDGET; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return '';
      const label = el.getAttribute('aria-label') || '';
      const cls = typeof el.className === 'string' ? el.className : '';
      // Search and wishlist each have two homes: the storefront nav (which
      // the front page shows) and the browse list (behind the Browse tab).
      // Either satisfies "a keyboard user can reach it" — the budget below
      // is what actually keeps them close to the top of the tab order.
      const placeholder = el.getAttribute('placeholder') || '';
      if (
        label === 'Search store' ||
        label === 'Search the catalog' ||
        placeholder === 'Search store' ||
        placeholder === 'Search games'
      ) {
        return 'search';
      }
      if (cls.includes('store-capsule') || cls.includes('featured-art')) return 'capsule';
      if (/^Download /i.test(label) || /^\s*Download\s*$/i.test(el.textContent || '')) {
        return 'download';
      }
      if (
        cls.includes('watch-toggle') ||
        cls.includes('store-nav-wishlist') ||
        /^Wishlist /i.test(label) ||
        /^Open wishlist/i.test(label)
      ) {
        return 'wishlist';
      }
      return '';
    });
    if (id && hits[id] === undefined) hits[id] = i;
    if (hits.search && hits.capsule && hits.download && hits.wishlist) break;
  }
  const missing = ['search', 'capsule', 'download', 'wishlist'].filter((key) => hits[key] === undefined);
  const summary = `search@${hits.search ?? '—'}  capsule@${hits.capsule ?? '—'}  download@${hits.download ?? '—'}  wishlist@${hits.wishlist ?? '—'}  (budget ${TAB_BUDGET})`;
  record(
    'b',
    'Tab reaches search, a capsule, Download, and wishlist within 40 stops',
    missing.length === 0,
    missing.length ? `${summary}; missing: ${missing.join(', ')}` : summary,
  );
} catch (error) {
  record(
    'b',
    'Tab reaches search, a capsule, Download, and wishlist within 40 stops',
    false,
    error.message,
  );
}

// (c) Library context menu: focus in, arrows move, Escape restores.
try {
  await ensureLibraryGame(page);
  await page.locator('.game-options').click({ force: true });
  const menu = page.locator('.context-menu[role="menu"]');
  await menu.waitFor({ timeout: 5_000 });
  const opened = await page.evaluate(() => {
    const root = document.querySelector('.context-menu[role="menu"]');
    const active = document.activeElement;
    return {
      focusInside: Boolean(root && active && root.contains(active)),
      active: (active?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  await page.keyboard.press('ArrowDown');
  const moved = await page.evaluate(() => {
    const active = document.activeElement;
    const root = document.querySelector('.context-menu[role="menu"]');
    return {
      stillInside: Boolean(root && active && root.contains(active)),
      active: (active?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => {
    const root = document.querySelector('.context-menu');
    const active = document.activeElement;
    const opener = document.querySelector('.game-options');
    return {
      gone: !root,
      restored: Boolean(opener && active === opener),
      active: active
        ? `${active.tagName.toLowerCase()}${active.className ? '.' + String(active.className).split(/\s+/)[0] : ''}`
        : '(none)',
    };
  });
  const problems = [];
  if (!opened.focusInside) problems.push(`open: focus was "${opened.active || '(none)'}", not inside the menu`);
  if (!moved.stillInside || moved.active === opened.active) {
    problems.push(`arrows: focus did not move to another menuitem (now "${moved.active || '(none)'}")`);
  }
  if (!closed.gone) problems.push('Escape: menu stayed open');
  if (!closed.restored) problems.push(`Escape: focus not returned to the options button (now ${closed.active})`);
  record(
    'c',
    'library context menu takes focus, arrows move, Escape restores',
    problems.length === 0,
    problems.length ? problems.join('\n') : `focus "${opened.active}" → "${moved.active}", Escape restored`,
  );
} catch (error) {
  record(
    'c',
    'library context menu takes focus, arrows move, Escape restores',
    false,
    error.message,
  );
}

// (d) Sign-in dialog traps Tab and restores focus on close.
try {
  await goStore(page);
  await page.locator('.account-menu > button').click({ force: true });
  await page.getByRole('menuitem', { name: /sign in/i }).click({ force: true });
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 5_000 });

  const opened = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"]');
    const active = document.activeElement;
    return {
      focusInside: Boolean(root && active && root.contains(active)),
      active: active
        ? `${active.tagName.toLowerCase()} "${(active.getAttribute('aria-label') || active.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)}"`
        : '(none)',
    };
  });

  const focusableCount = await dialog.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').count();
  const escaped = [];
  for (let i = 0; i < focusableCount + 3; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const root = document.querySelector('[role="dialog"]');
      return Boolean(root && document.activeElement && root.contains(document.activeElement));
    });
    if (!inside) {
      escaped.push(await describeFocus(page));
      break;
    }
  }

  await page.locator('.dialog-close').click({ force: true });
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {
    timeout: 5_000,
  });
  const restored = await page.evaluate(() => {
    const active = document.activeElement;
    const account = document.querySelector('.account-menu > button');
    return {
      restored: Boolean(account && active === account),
      active: active
        ? `${active.tagName.toLowerCase()}${active.className ? '.' + String(active.className).split(/\s+/)[0] : ''}`
        : '(none)',
    };
  });

  const problems = [];
  if (!opened.focusInside) problems.push(`open: focus was ${opened.active}, not inside the dialog`);
  if (escaped.length) problems.push(`Tab escaped the dialog onto ${escaped[0]}`);
  if (!restored.restored) {
    problems.push(`close: focus not returned to the account menu button (now ${restored.active})`);
  }
  record(
    'd',
    'sign-in dialog traps Tab and restores focus on close',
    problems.length === 0,
    problems.length ? problems.join('\n') : 'focus trapped and restored to the account menu button',
  );
} catch (error) {
  record(
    'd',
    'sign-in dialog traps Tab and restores focus on close',
    false,
    error.message,
  );
  await page.keyboard.press('Escape').catch(() => {});
  if (await page.locator('.dialog-close').count()) {
    await page.locator('.dialog-close').click().catch(() => {});
  }
}

// (e) Scan + download live regions exist with aria-live.
try {
  await goStore(page);
  const live = await page.evaluate(() => {
    const scan = [...document.querySelectorAll('.store-scanline [role="status"], .store-scanline [role="log"]')];
    const download = [...document.querySelectorAll('.downloads-bar[role="status"], .downloads-bar[role="log"], .downloads-area [role="status"], .downloads-area [role="log"]')];
    const describe = (el) => ({
      role: el.getAttribute('role'),
      live: el.getAttribute('aria-live'),
      cls: typeof el.className === 'string' ? el.className : '',
    });
    return {
      scan: scan.map(describe),
      download: download.map(describe),
    };
  });
  const problems = [];
  if (live.scan.length === 0) {
    problems.push('scan: no role=status/log inside .store-scanline');
  } else if (live.scan.some((el) => !el.live)) {
    problems.push(
      `scan: ${live.scan.filter((el) => !el.live).length} status/log element(s) missing aria-live`,
    );
  }
  if (live.download.length === 0) {
    problems.push('download: no role=status/log on the downloads bar');
  } else if (live.download.some((el) => !el.live)) {
    problems.push(
      `download: ${live.download.filter((el) => !el.live).length} status/log element(s) missing aria-live`,
    );
  }
  record(
    'e',
    'scan and download status/log regions exist with aria-live',
    problems.length === 0,
    problems.length
      ? problems.join('\n')
      : `scan ${live.scan.map((s) => `${s.role}/${s.live}`).join(', ')} · download ${live.download.map((s) => `${s.role}/${s.live}`).join(', ')}`,
  );
} catch (error) {
  record(
    'e',
    'scan and download status/log regions exist with aria-live',
    false,
    error.message,
  );
}

// (f) External URL actions must be links, not buttons.
try {
  await goStore(page);
  const offenders = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].flatMap((btn) => {
      const name = `${btn.getAttribute('aria-label') || ''} ${btn.textContent || ''}`.replace(/\s+/g, ' ').trim();
      const cls = typeof btn.className === 'string' ? btn.className : '';
      const looksExternal =
        cls.includes('download-action-link') ||
        /release page/i.test(name) ||
        /^open .+ release page$/i.test(name);
      return looksExternal ? [name || cls] : [];
    });
  });
  record(
    'f',
    'no <button> whose handler only opens an external URL',
    offenders.length === 0,
    offenders.length
      ? `${offenders.length} release-page button(s); first: ${offenders[0]}`
      : 'no external-only buttons',
  );
} catch (error) {
  record('f', 'no <button> whose handler only opens an external URL', false, error.message);
}

// (g) Live tokens meet AA against the worst background from a11y-tokens.json.
try {
  const live = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
  }, Object.keys(tokens));
  const failures = [];
  const lines = [];
  for (const [name, spec] of Object.entries(tokens)) {
    const value = live[name] || spec.current;
    const ratio = contrastRatio(value, spec.worstBackground);
    const ok = ratio + 1e-6 >= AA;
    lines.push(
      `${name} ${value} on ${spec.worstBackground} → ${ratio.toFixed(2)}:1${ok ? '' : '  < 4.5'}`,
    );
    if (!ok) failures.push(`${name} ${ratio.toFixed(2)}:1 (need ≥ ${AA}:1)`);
  }
  record(
    'g',
    'token contrast from a11y-tokens.json meets 4.5:1 on each worst background',
    failures.length === 0,
    failures.length ? `${failures.join('\n')}\n${lines.join('\n')}` : lines.join('\n'),
  );
} catch (error) {
  record(
    'g',
    'token contrast from a11y-tokens.json meets 4.5:1 on each worst background',
    false,
    error.message,
  );
}

await browser.close();

const failed = results.filter((item) => !item.pass);
const passed = results.filter((item) => item.pass);
console.log('');
console.log(`== ${failed.length} failed, ${passed.length} passed ==`);
if (failed.length) {
  console.log('Failed checks: ' + failed.map((item) => item.id).join(', '));
}

process.exit(failed.length ? 1 : 0);
