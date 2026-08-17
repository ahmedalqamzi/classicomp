import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { installBuild, launchBuild, uninstallBuild, runSetupTool } =
  createRequire(import.meta.url)('./install.cjs');
const devServerUrl = process.argv.includes('--dev') ? 'http://127.0.0.1:1420/' : null;

app.setName('Classicomp');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

function createWindow() {
  const win = new BrowserWindow({
    title: 'Classicomp',
    icon: path.join(projectRoot, 'electron', 'icon.png'),
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#0e141b',
    webPreferences: {
      preload: path.join(projectRoot, 'electron', 'preload.cjs'),
    },
  });

  // External links (release pages, repos, donate) belong in the system
  // browser, never in a chromeless Electron child window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(projectRoot, 'dist', 'index.html'));
  }
}

// Installing unpacks the downloaded artifact into the app's own data dir and
// resolves it to something launchable; launching runs that result detached.
// Probed once so asset picking can offer Windows builds when they are
// actually playable here.
// A real file picker, because the renderer's <input type="file"> yields only a
// name — and a name is useless when the point is to hand the file's actual
// location to a game.
ipcMain.handle('shell:pick-file', async (event, accepts) => {
  const extensions = String(accepts ?? '')
    .split(',')
    .map((part) => part.trim().replace(/^\./, ''))
    .filter(Boolean);
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Choose your original copy',
    properties: ['openFile'],
    filters: extensions.length > 0
      ? [{ name: 'Game files', extensions }, { name: 'All files', extensions: ['*'] }]
      : [{ name: 'All files', extensions: ['*'] }],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

// Probed once so asset picking can offer Windows builds when they are
// actually playable here.
ipcMain.handle('shell:has-wine', () =>
  new Promise((resolve) => {
    execFile('wine', ['--version'], (error) => resolve(!error));
  }),
);

ipcMain.handle('shell:install-build', async (_event, gameId, fileName) => {
  if (typeof gameId !== 'string' || typeof fileName !== 'string') {
    return { ok: false, reason: 'Nothing to install.' };
  }
  return installBuild({
    archivePath: path.join(app.getPath('downloads'), fileName),
    gameDir: path.join(app.getPath('userData'), 'games', gameId),
    runtimesDir: path.join(app.getPath('userData'), 'runtimes'),
  });
});

ipcMain.handle('shell:launch-build', async (_event, target, options) =>
  launchBuild(target, {
    runtimesDir: path.join(app.getPath('userData'), 'runtimes'),
    prerequisite: options?.prerequisite ?? null,
    romPath: options?.romPath ?? null,
  }),
);

ipcMain.handle('shell:run-setup', async (_event, gameId, prerequisite, romPath) =>
  runSetupTool({
    gameDir: path.join(app.getPath('userData'), 'games', gameId),
    prerequisite,
    romPath,
  }),
);

ipcMain.handle('shell:uninstall-build', async (_event, gameId, launchTarget) => {
  if (typeof gameId !== 'string' || gameId.length === 0) return { ok: false, reason: 'Nothing to remove.' };
  return uninstallBuild({
    gameDir: path.join(app.getPath('userData'), 'games', gameId),
    launchTarget,
  });
});

app.whenReady().then(() => {
  // The media APIs (Steam storefront, Twitch OAuth, IGDB) serve no CORS
  // headers; the renderer's lookups need them, so inject a permissive
  // origin for just those hosts — including IGDB's POST preflights.
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'https://store.steampowered.com/*',
        'https://steamcommunity.com/*',
        'https://id.twitch.tv/*',
        'https://api.igdb.com/*',
      ],
    },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      for (const name of Object.keys(responseHeaders)) {
        if (name.toLowerCase().startsWith('access-control-allow-')) delete responseHeaders[name];
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
      callback({
        responseHeaders,
        statusLine: details.method === 'OPTIONS' ? 'HTTP/1.1 204 No Content' : details.statusLine,
      });
    },
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
