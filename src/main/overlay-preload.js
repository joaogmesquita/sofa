const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voice', {
  onStart: (cb) => ipcRenderer.on('voice:start', () => cb()),
  onStop: (cb) => ipcRenderer.on('voice:stop', () => cb()),
  onShow: (cb) => ipcRenderer.on('voice:show', (_e, m) => cb(m)),
  onHide: (cb) => ipcRenderer.on('voice:hide', () => cb()),
  onVol: (cb) => ipcRenderer.on('vol:show', (_e, v) => cb(v)),
  sendAudio: (buf) => ipcRenderer.send('voice:audio', buf),
  cancelled: (why) => ipcRenderer.send('voice:cancel', why)
});
