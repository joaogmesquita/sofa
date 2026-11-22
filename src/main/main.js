const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');

const services = require('./services');
const osInput = require('./os-input');
const osVolume = require('./os-volume');
const Edge = require('./edge');
const Gamepad = require('./gamepad');
const RemoteServer = require('./remote-server');
const Dial = require('./dial');
const { lanIp } = require('./net');
const { Voice, parse } = require('./voice');

const REMOTE_PORT = 8787;
const DIAL_PORT = 56790;
const DEVICE_NAME = 'Sofá (PC)';

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let overlay;
let voiceState = 'idle'; // idle | listening | thinking
let hideTimer;
const voice = new Voice();
const ip = lanIp();
const edge = new Edge(path.join(app.getPath('userData'), 'edge-profile'));
const gamepad = new Gamepad();
const remote = new RemoteServer(REMOTE_PORT);
const dial = new Dial({ ip, port: DIAL_PORT, name: DEVICE_NAME });
const status = { remoteUrl: `http://${ip}:${REMOTE_PORT}`, deviceName: DEVICE_NAME, gamepads: 0, phones: 0, cast: false, active: null };

function pushStatus(patch = {}) {
  Object.assign(status, patch);
  win?.webContents.send('status', status);
  remote.setState({ active: status.active, services: services.map(({ id, name, color }) => ({ id, name, color })) });
}

function showLauncher() {
  if (!win) return;
  win.show();
  win.setAlwaysOnTop(true);
  app.focus({ steal: true });
  win.focus();
  setTimeout(() => win.setAlwaysOnTop(false), 400);
}

async function launch(id, urlOverride) {
  const s = services.find((x) => x.id === id);
  if (!s) return;
  const svc = urlOverride ? { ...s, url: urlOverride } : s;
  if (edge.active && edge.service?.id === id && urlOverride) return edge.navigate(urlOverride);
  await edge.launch(svc);
}

async function route(action) {
  try {
    switch (action.type) {
      case 'home':
        if (edge.active) await edge.close();
        return showLauncher();
      case 'launch':
        return launch(action.id, action.url);
      case 'voice':
        return voiceToggle();
      case 'aspect': {
        if (!edge.active) return;
        const label = await edge.eval('window.__sofaAspect ? __sofaAspect() : null');
        if (label) { overlayShow('Proporção', label); overlayHide(1500); }
        return;
      }
      case 'command':
        return runCommand(action.text);
      case 'volume':
        return changeVolume(action);
      case 'mouse':
        return osInput.move(action.dx, action.dy);
      case 'click':
        return osInput.click(action.button);
      case 'scroll':
        return osInput.scroll(action.amount);
    }
    if (edge.active) return await edge.handle(action);
    win?.webContents.send('action', action);
  } catch (e) {
    console.warn('[route]', action.type, e.message);
  }
}

// ---------- voz ----------
function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  const w = 980, h = 180;
  overlay = new BrowserWindow({
    width: w, height: h, x: Math.round(workArea.x + (workArea.width - w) / 2), y: workArea.y + workArea.height - h,
    transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(path.join(__dirname, '..', 'voice', 'overlay.html'));
}

function overlayShow(state, text, cls = '') {
  clearTimeout(hideTimer);
  if (!overlay.isVisible()) overlay.showInactive();
  overlay.webContents.send('voice:show', { state, text, cls });
}

// volume exato pela API de áudio do Windows, com barra na tela; teclas de mídia como reserva
function changeVolume(action) {
  let v;
  try {
    if (action.dir === 'mute') v = osVolume.toggleMute();
    else v = osVolume.change(action.delta ?? (action.dir === 'voldown' ? -2 : 2));
  } catch (e) {
    console.warn('[volume]', e.message);
    return osInput.volume(action.dir || (action.delta < 0 ? 'voldown' : 'volup'));
  }
  clearTimeout(hideTimer);
  if (!overlay.isVisible()) overlay.showInactive();
  overlay.webContents.send('vol:show', v);
  if (voiceState === 'idle') overlayHide(1500);
  remote.setState({ volume: v });
}

function overlayHide(delay = 1800) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    overlay.webContents.send('voice:hide');
    setTimeout(() => { if (voiceState === 'idle') overlay.hide(); }, 350);
  }, delay);
}

function voiceToggle() {
  if (voiceState === 'listening') return overlay.webContents.send('voice:stop');
  if (voiceState === 'thinking') return;
  if (!voice.ready) {
    overlayShow('Voz', 'Carregando o reconhecimento de voz…', 'thinking');
    return overlayHide(2500);
  }
  voiceState = 'listening';
  clearTimeout(hideTimer);
  overlay.showInactive();
  overlay.webContents.send('voice:start');
}

async function runCommand(text) {
  voiceState = 'idle';
  if (!text || !text.trim()) {
    overlayShow('Voz', 'Não ouvi nada', 'error');
    return overlayHide();
  }
  const cmd = parse(text, edge.service?.id);
  if (!cmd) {
    overlayShow('Não entendi', `“${text}”`, 'error');
    return overlayHide(2600);
  }
  overlayShow(`“${text}”`, cmd.label);
  overlayHide(2200);
  for (const a of cmd.actions) await route(a);
}

ipcMain.on('voice:audio', async (_e, buf) => {
  voiceState = 'thinking';
  try {
    const text = await voice.transcribe(Buffer.from(buf));
    await runCommand(text);
  } catch (e) {
    voiceState = 'idle';
    overlayShow('Voz', 'Erro no reconhecimento: ' + e.message, 'error');
    overlayHide(3000);
  }
});
ipcMain.on('voice:cancel', () => {
  voiceState = 'idle';
  overlayHide(1400);
});

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 800 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    title: 'Sofá',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, '..', 'launcher', 'index.html'));
}

ipcMain.handle('services', async () => {
  const jellyfinUp = await checkUrl('http://localhost:8096/health');
  return services.map(({ id, name, hint, color }) => ({
    id, name, color,
    hint: id === 'jellyfin' && !jellyfinUp ? 'Servidor não instalado' : hint,
    disabled: id === 'jellyfin' && !jellyfinUp
  }));
});
ipcMain.handle('status', async () => ({ ...status, qr: await QRCode.toDataURL(status.remoteUrl, { margin: 1, width: 360 }) }));
ipcMain.on('action', (_e, action) => route(action));
ipcMain.on('quit', () => app.quit());

app.whenReady().then(async () => {
  // microfone liberado só para as janelas locais do Sofá
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && wc.getURL().startsWith('file://')));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && !!wc && wc.getURL().startsWith('file://'));
  createWindow();
  createOverlay();
  voice.start();

  edge.on('opened', (s) => pushStatus({ active: s.name }));
  edge.on('closed', () => {
    dial.setRunning('YouTube', false);
    pushStatus({ active: null });
    showLauncher();
  });

  gamepad.on('action', route);
  gamepad.on('status', (n) => pushStatus({ gamepads: n }));
  gamepad.start();

  remote.on('action', route);
  remote.on('clients', (n) => pushStatus({ phones: n }));
  try {
    await remote.start();
  } catch (e) {
    console.warn('[remote] não abriu a porta', REMOTE_PORT, e.message);
  }

  // transmissão a partir do app do YouTube no celular
  dial.on('launch', (name, body) => {
    if (name !== 'YouTube') return;
    const qs = body ? `?${body}` : '';
    launch('youtube', `https://www.youtube.com/tv${qs}`);
  });
  dial.on('stop', (name) => {
    if (name === 'YouTube' && edge.service?.id === 'youtube') edge.close();
  });
  try {
    await dial.start();
    pushStatus({ cast: true });
  } catch (e) {
    console.warn('[dial]', e.message);
  }

  globalShortcut.register('Alt+Home', () => route({ type: 'home' }));
  pushStatus();
});

app.on('second-instance', showLauncher);
app.on('will-quit', () => globalShortcut.unregisterAll());
let quitting = false;
app.on('before-quit', async (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  gamepad.stop();
  dial.stop();
  voice.stop();
  await edge.close().catch(() => {});
  app.quit();
});
