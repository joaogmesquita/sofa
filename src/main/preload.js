const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sofa', {
  services: () => ipcRenderer.invoke('services'),
  status: () => ipcRenderer.invoke('status'),
  send: (action) => ipcRenderer.send('action', action),
  quit: () => ipcRenderer.send('quit'),
  onAction: (cb) => ipcRenderer.on('action', (_e, a) => cb(a)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s))
});
