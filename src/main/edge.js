// Abre os serviços no Microsoft Edge (DRM PlayReady) e controla a página via CDP.
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const CDP = require('chrome-remote-interface');

const PORT = 9333;
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const BLANK = 'http://127.0.0.1:8787/blank.html';
const INJECT_DIR = path.join(__dirname, '..', 'inject');

const KEYS = {
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  f: { key: 'f', code: 'KeyF', keyCode: 70, text: 'f' },
  m: { key: 'm', code: 'KeyM', keyCode: 77, text: 'm' }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Edge extends EventEmitter {
  constructor(profileDir) {
    super();
    this.profileDir = profileDir;
    this.exe = EDGE_PATHS.find((p) => fs.existsSync(p));
    this.proc = null;
    this.running = false;
    this.browser = null;
    this.client = null;
    this.service = null;
  }

  get active() {
    return this.running;
  }

  buildScript(service) {
    const files = ['common.js', ...(service.mode === 'spatial' ? ['spatial-nav.js'] : []), ...service.inject];
    const prefix = service.gamepad === 'native' ? 'window.__sofaNativeGamepad = true;\n' : '';
    return prefix + files.map((f) => fs.readFileSync(path.join(INJECT_DIR, f), 'utf8')).join('\n;\n');
  }

  async launch(service) {
    if (!this.exe) throw new Error('Microsoft Edge não encontrado');
    await this.close();
    this.service = service;
    const args = [
      `--user-data-dir=${this.profileDir}`,
      `--remote-debugging-port=${PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--edge-skip-compat-layer-relaunch',
      '--hide-crash-restore-bubble',
      '--disable-session-crashed-bubble',
      '--autoplay-policy=no-user-gesture-required',
      '--start-fullscreen',
      // com UA de TV, abre numa página preta local: o UA (e os client hints) é trocado via CDP antes de navegar
      `--app=${service.ua ? BLANK : service.url}`
    ];
    if (service.ua) args.push(`--user-agent=${service.ua}`);
    // o msedge.exe pode encerrar e repassar para outro processo; quem diz se o
    // navegador está aberto é a conexão CDP do navegador, não este processo
    this.proc = spawn(this.exe, args, { detached: false, stdio: 'ignore' });
    this.proc.on('error', (e) => console.warn('[edge] spawn:', e.message));
    this.running = true;
    this.emit('opened', service);
    try {
      await this.attachBrowser();
      await this.connect();
    } catch (e) {
      console.warn('[edge]', e.message);
      if (!this.browser) this.markClosed();
    }
  }

  async attachBrowser() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && this.running) {
      try {
        const v = await CDP.Version({ port: PORT });
        const browser = await CDP({ target: v.webSocketDebuggerUrl });
        this.browser = browser;
        browser.on('disconnect', () => {
          if (this.browser === browser) this.markClosed();
        });
        return;
      } catch {
        await sleep(300);
      }
    }
    throw new Error('Edge não abriu a porta de depuração');
  }

  markClosed() {
    if (!this.running) return;
    this.running = false;
    this.browser = null;
    this.client = null;
    this.service = null;
    this.proc = null;
    this.emit('closed');
  }

  async navigate(url) {
    const c = await this.ensureClient();
    await c.Page.navigate({ url });
  }

  async findPage() {
    const targets = (await CDP.List({ port: PORT })).filter((t) => t.type === 'page');
    // páginas internas (diálogo de sincronização etc.) são fechadas
    for (const t of targets) {
      if (/^edge:\/\/(sync|signin|welcome)/.test(t.url) && this.browser) {
        this.browser.Target.closeTarget({ targetId: t.id }).catch(() => {});
      }
    }
    return targets.find((t) => /^(https?|file):/.test(t.url)) || targets.find((t) => t.url === 'about:blank');
  }

  async connect() {
    const deadline = Date.now() + 20000;
    let target;
    while (!target && Date.now() < deadline && this.running) {
      try {
        target = await this.findPage();
      } catch {}
      if (!target) await sleep(300);
    }
    if (!target) throw new Error('página do Edge não apareceu');
    const client = await CDP({ port: PORT, target: target.id });
    this.client = client;
    this.targetId = target.id;
    client.on('disconnect', () => {
      if (this.client === client) this.client = null;
    });
    const script = this.buildScript(this.service);
    await client.Page.enable();
    await client.Page.addScriptToEvaluateOnNewDocument({ source: script });
    if (this.service.ua) {
      await client.Network.setUserAgentOverride({ userAgent: this.service.ua });
      if (target.url.startsWith(BLANK)) await client.Page.navigate({ url: this.service.url });
    } else {
      await client.Runtime.evaluate({ expression: script }).catch(() => {});
    }
    return client;
  }

  async ensureClient() {
    if (this.client) {
      // a página ativa pode ter mudado (pop-up de login, nova aba)
      try {
        const page = await this.findPage();
        if (page && page.id === this.targetId) return this.client;
        await this.client.close().catch(() => {});
        this.client = null;
      } catch {
        return this.client;
      }
    }
    return this.connect();
  }

  async eval(expression) {
    const c = await this.ensureClient();
    const r = await c.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
    return r.result && r.result.value;
  }

  async key(name) {
    const k = KEYS[name];
    if (!k) return;
    const c = await this.ensureClient();
    const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
    await c.Input.dispatchKeyEvent({ type: k.text ? 'keyDown' : 'rawKeyDown', text: k.text, ...base });
    await c.Input.dispatchKeyEvent({ type: 'keyUp', ...base });
  }

  async handle(action) {
    const s = this.service;
    if (!s) return;
    switch (action.type) {
      case 'nav':
        if (s.mode === 'spatial' && (await this.eval(`window.__sofa && __sofa.nav(${JSON.stringify(action.dir)})`)))
          return;
        return this.key(action.dir);
      case 'ok':
        if (s.mode === 'spatial' && (await this.eval('window.__sofa && __sofa.ok()'))) return;
        return this.key(s.mode === 'spatial' ? s.keys.playpause : 'Enter');
      case 'back':
        if (s.back === 'spatial') return this.eval('window.__sofa && __sofa.back()');
        if (s.back === 'history') return this.eval('history.back()');
        return this.key('Escape');
      case 'playpause':
        return this.key(s.keys.playpause || ' ');
      case 'seek':
        return this.key(action.dir === 'back' ? 'left' : 'right');
      case 'key':
        return this.key(action.key);
      case 'text': {
        const c = await this.ensureClient();
        return c.Input.insertText({ text: action.text });
      }
    }
  }

  async close() {
    if (!this.running) return;
    try {
      if (this.browser) await this.browser.Browser.close();
      else this.proc?.kill();
    } catch {
      this.proc?.kill();
    }
    const deadline = Date.now() + 4000;
    while (this.running && Date.now() < deadline) await sleep(100);
    this.markClosed();
  }
}

module.exports = Edge;
