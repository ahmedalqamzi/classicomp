// The renderer runs with context isolation on and no Node access, so the one
// thing it cannot do on its own is touch the filesystem it just downloaded
// into. This exposes exactly that and nothing more: which platform this is,
// installing a named download, and launching what installing produced. Both
// calls resolve their own paths in the main process, so the renderer never
// gets to name an arbitrary location on disk.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('classicompShell', {
  // Asset picking and install both branch on these; the renderer has no
  // process of its own to ask. Architecture matters as much as OS: an
  // x86_64 build does not run on an ARM Linux box.
  platform: process.platform,
  arch: process.arch,
  hasWine: () => ipcRenderer.invoke('shell:has-wine'),
  pickFile: (accepts) => ipcRenderer.invoke('shell:pick-file', accepts),
  installBuild: (gameId, fileName) => ipcRenderer.invoke('shell:install-build', gameId, fileName),
  launchBuild: (target, options) => ipcRenderer.invoke('shell:launch-build', target, options),
  runSetup: (gameId, prerequisite, romPath) =>
    ipcRenderer.invoke('shell:run-setup', gameId, prerequisite, romPath),
  uninstallBuild: (gameId, launchTarget) =>
    ipcRenderer.invoke('shell:uninstall-build', gameId, launchTarget),
});
