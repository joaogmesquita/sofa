const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sofa', {
  services: () => ipcRenderer.invoke('services'),
  status: () => ipcRenderer.invoke('status'),
  recents: () => ipcRenderer.invoke('recents'),
  removeRecent: (key) => ipcRenderer.send('recent-remove', key),
  send: (action) => ipcRenderer.send('action', action),
  quit: () => ipcRenderer.send('quit'),
  onAction: (cb) => ipcRenderer.on('action', (_e, a) => cb(a)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  onRecents: (cb) => ipcRenderer.on('recents', (_e, r) => cb(r)),
  onServicesChanged: (cb) => ipcRenderer.on('services-changed', () => cb())
});
