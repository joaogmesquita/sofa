// Gera as imagens de divulgação num Edge headless separado (não mexe na tela do usuário).
// Uso: node promo/build.js   (a partir da pasta do projeto)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');
const QRCode = require('qrcode');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9555;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const SERVICES = require(path.join(ROOT, 'src/main/services.js'));

const iconsDir = path.join(process.env.APPDATA, 'sofa', 'icons');
function icon(id) {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(iconsDir, 'index.json'), 'utf8'))[id];
    return `data:${idx.type};base64,${fs.readFileSync(path.join(iconsDir, idx.file)).toString('base64')}`;
  } catch {
    return null;
  }
}

async function mockScript() {
  const services = SERVICES.map(({ id, name, hint, color }) => ({
    id, name, color, hint: id === 'jellyfin' ? 'Filmes e séries do PC' : hint, icon: icon(id), disabled: false
  }));
  const qr = await QRCode.toDataURL('https://github.com/joaogmesquita/sofa', { margin: 1, width: 360 });
  const status = { remoteUrl: 'http://192.168.0.10:8787', deviceName: 'Sofá (PC)', gamepads: 1, phones: 1, cast: true, active: null, qr };
  const recents = [
    { key: 'r1', service: 'netflix', serviceName: 'Netflix', color: '#e50914', title: 'Série de suspense', subtitle: 'T2:E4', time: 1500, duration: 3100 },
    { key: 'r2', service: 'youtube', serviceName: 'YouTube', color: '#ff0033', title: 'Documentário: o espaço em 4K', subtitle: 'Canal de ciência', time: 900, duration: 2400 },
    { key: 'r3', service: 'disney', serviceName: 'Disney+', color: '#113ccf', title: 'Animação da semana', time: 2000, duration: 5600 },
    { key: 'r4', service: 'xcloud', serviceName: 'Xbox Cloud Gaming', color: '#107c10', title: 'Jogo de corrida', time: 600, duration: 0 }
  ];
  return `window.sofa = {
    services: async () => (${JSON.stringify(services)}),
    status: async () => (${JSON.stringify(status)}),
    recents: async () => (${JSON.stringify(recents)}),
    removeRecent() {}, send() {}, quit() {},
    onAction(cb) { window.__act = cb; }, onStatus() {}, onRecents() {}, onServicesChanged() {}
  };`;
}

async function save(c, file) {
  const { data } = await c.Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
  console.log('ok', file);
}

async function open(url, setup, { w, h, scale = 1, mobile = false, transparent = false }) {
  const t = await CDP.New({ port: PORT, url: 'about:blank' });
  const c = await CDP({ port: PORT, target: t.id });
  await c.Page.enable();
  if (setup) await c.Page.addScriptToEvaluateOnNewDocument({ source: setup });
  await c.Emulation.setDeviceMetricsOverride({ width: w, height: h, deviceScaleFactor: scale, mobile });
  if (transparent) await c.Emulation.setDefaultBackgroundColorOverride({ color: { r: 0, g: 0, b: 0, a: 0 } });
  await c.Page.navigate({ url });
  await wait(2500);
  return c;
}

const key = (c, k) => c.Runtime.evaluate({ expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' }))` });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sofa-promo-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  await wait(2500);
  try {
    const mock = await mockScript();
    const launcher = fileUrl(path.join(ROOT, 'src/launcher/index.html'));

    // 1) tela inicial
    for (const [w, h, tag] of [[1920, 1080, '16x9'], [2560, 1080, 'ultrawide']]) {
      const c = await open(launcher, mock, { w, h });
      await key(c, 'ArrowDown'); await wait(150); await key(c, 'ArrowRight'); await wait(1300);
      await save(c, `home-netflix-${tag}.png`);
      await c.close();
    }
    {
      const c = await open(launcher, mock, { w: 1920, h: 1080 });
      await wait(1000);
      await save(c, 'home-recent-16x9.png');
      await key(c, 'ArrowDown'); await wait(150);
      for (let i = 0; i < 5; i++) { await key(c, 'ArrowRight'); await wait(120); }
      await wait(1300);
      await save(c, 'home-xcloud-16x9.png');
      await c.close();
    }

    // 2) barras de voz e de volume (fundo transparente)
    {
      const c = await open(fileUrl(path.join(ROOT, 'src/voice/overlay.html')), `
        const L = {}; window.__L = L;
        window.voice = { onStart(f){L.start=f}, onStop(f){L.stop=f}, onShow(f){L.show=f}, onHide(f){L.hide=f}, onVol(f){L.vol=f}, sendAudio(){}, cancelled(){} };`,
        { w: 980, h: 180, scale: 2, transparent: true });
      await c.Runtime.evaluate({ expression: `__L.show({ state: '“procurar Round 6 na Netflix”', text: 'Buscando “round 6” na Netflix' })` });
      await wait(800);
      await save(c, 'overlay-voice.png');
      await c.Runtime.evaluate({ expression: `__L.hide(); __L.vol({ level: 64, muted: false })` });
      await wait(800);
      await save(c, 'overlay-volume.png');
      await c.close();
    }

    // 3) controle no celular (PWA), com WebSocket simulado
    {
      const svc = JSON.stringify(SERVICES.map(({ id, name, color }) => ({ id, name, color })));
      const c = await open(fileUrl(path.join(ROOT, 'src/remote/index.html')), `
        window.WebSocket = class { constructor() { setTimeout(() => { this.readyState = 1; this.onopen && this.onopen();
          this.onmessage && this.onmessage({ data: JSON.stringify({ type: 'state', state: { active: 'Netflix', services: ${svc} } }) }); }, 50); }
          send() {} close() {} };`,
        { w: 390, h: 844, scale: 2, mobile: true });
      await save(c, 'remote-phone.png');
      await c.close();
    }

    // 4) pôsteres para o X (1600x900), compostos a partir das imagens acima
    for (const f of fs.readdirSync(path.join(__dirname, 'posters')).filter((x) => x.endsWith('.html')).sort()) {
      const c = await open(fileUrl(path.join(__dirname, 'posters', f)), null, { w: 1600, h: 900 });
      await save(c, 'x-' + f.replace('.html', '.png'));
      await c.close();
    }
  } finally {
    edge.kill();
  }
  process.exit(0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
