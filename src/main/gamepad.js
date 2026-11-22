// Controle de videogame lido via XInput (Xbox e compatíveis), em polling a 60 Hz.
// Funciona com qualquer janela em foco, inclusive o Edge.
const koffi = require('koffi');
const { EventEmitter } = require('events');

const B = {
  UP: 0x0001, DOWN: 0x0002, LEFT: 0x0004, RIGHT: 0x0008,
  START: 0x0010, BACK: 0x0020, L3: 0x0040, R3: 0x0080,
  LB: 0x0100, RB: 0x0200, GUIDE: 0x0400,
  A: 0x1000, X: 0x4000, Y: 0x8000, B: 0x2000
};

const MIC = 0x40000; // botão virtual: microfone do DualSense

// Mapa botão -> ação. 'repeat' = repete enquanto segura.
const PRESS = [
  [B.A, { type: 'ok' }],
  [B.B, { type: 'back' }],
  [B.X, { type: 'playpause' }],
  [B.Y, { type: 'aspect' }],
  [B.START, { type: 'playpause' }],
  [B.GUIDE, { type: 'home' }],
  [B.R3, { type: 'click', button: 'left' }],
  [B.L3, { type: 'click', button: 'right' }],
  [MIC, { type: 'voice' }]
];
const REPEAT = [
  [B.UP, { type: 'nav', dir: 'up' }],
  [B.DOWN, { type: 'nav', dir: 'down' }],
  [B.LEFT, { type: 'nav', dir: 'left' }],
  [B.RIGHT, { type: 'nav', dir: 'right' }],
  [B.LB, { type: 'seek', dir: 'back' }],
  [B.RB, { type: 'seek', dir: 'fwd' }]
];

const DEADZONE = 12000;
const FIRST_DELAY = 380;
const REPEAT_EVERY = 110;

class Gamepad extends EventEmitter {
  constructor() {
    super();
    this.pads = [];
    this.connected = new Set();
    try {
      const lib = koffi.load('xinput1_4.dll');
      const G = koffi.struct('SOFA_XINPUT_GAMEPAD', {
        wButtons: 'uint16', bLeftTrigger: 'uint8', bRightTrigger: 'uint8',
        sThumbLX: 'int16', sThumbLY: 'int16', sThumbRX: 'int16', sThumbRY: 'int16'
      });
      const S = koffi.struct('SOFA_XINPUT_STATE', { dwPacketNumber: 'uint32', Gamepad: G });
      try {
        // XInputGetStateEx (ordinal 100) inclui o botão Guide
        this.getState = lib.func('__stdcall', 100, 'uint32', ['uint32', koffi.out(koffi.pointer(S))]);
      } catch {
        this.getState = lib.func('uint32 __stdcall XInputGetState(uint32 i, _Out_ SOFA_XINPUT_STATE *s)');
      }
    } catch (e) {
      console.warn('[gamepad] XInput indisponível:', e.message);
    }
    this.hidOpen = new Map();
    for (let i = 0; i < 4; i++) this.pads.push({ prev: 0, held: {}, lastScan: 0 });
  }

  start() {
    if (this.getState) this.timer = setInterval(() => this.poll(), 16);
    this.startHid();
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.hidTimer);
    for (const h of this.hidOpen.values()) try { h.dev.close(); } catch {}
  }

  count() {
    return this.connected.size + (this.hidOpen ? this.hidOpen.size : 0);
  }

  // ---- PlayStation (DualSense / DualShock 4) via HID, USB ou Bluetooth ----
  startHid() {
    this.hidOpen = new Map();
    let HID;
    try {
      HID = require('node-hid');
    } catch (e) {
      return console.warn('[gamepad] node-hid indisponível:', e.message);
    }
    const SONY = 0x054c;
    const PIDS = { 0x0ce6: 'DualSense', 0x0df2: 'DualSense Edge', 0x05c4: 'DualShock 4', 0x09cc: 'DualShock 4' };
    const scan = () => {
      let list = [];
      try { list = HID.devices(SONY, 0); } catch { return; }
      for (const d of list) {
        if (!PIDS[d.productId] || this.hidOpen.has(d.path)) continue;
        // só a interface de gamepad (usage page 1, usage 5)
        if (d.usagePage && d.usagePage !== 1) continue;
        try {
          const dev = new HID.HID(d.path);
          const pad = { prev: 0, held: {}, dev, name: PIDS[d.productId] };
          this.hidOpen.set(d.path, pad);
          dev.on('data', (buf) => this.handleSony(pad, buf));
          // DualSense no Bluetooth começa no modo "simples" (sem o botão do microfone).
          // Ler o relatório de calibração (0x05) faz o controle passar ao modo completo 0x31.
          if (pad.name.startsWith('DualSense')) {
            try { dev.getFeatureReport(0x05, 41); } catch {}
          }
          dev.on('error', () => {
            try { dev.close(); } catch {}
            this.hidOpen.delete(d.path);
            this.emit('status', this.count());
          });
          console.log('[gamepad] conectado:', pad.name);
          this.emit('status', this.count());
        } catch (e) {
          console.warn('[gamepad] não abriu', PIDS[d.productId], e.message);
        }
      }
    };
    scan();
    this.hidTimer = setInterval(scan, 2500);
  }

  handleSony(pad, buf) {
    // Relatório 0x01 com 64 bytes: DualSense USB (botões no byte 8).
    // Relatório 0x01 "simples": DualShock 4 e DualSense BT antes do modo completo
    //   (botões no byte 5; no Windows chega preenchido até 78 bytes).
    // Relatório 0x31: DualSense BT completo (deslocado 1 byte).
    let o, b0, b1, b2, l2, r2;
    const id = buf[0];
    if (id === 0x31) {
      o = 2; l2 = buf[o + 4]; r2 = buf[o + 5]; b0 = buf[o + 7]; b1 = buf[o + 8]; b2 = buf[o + 9];
    } else if (id === 0x01 && buf.length === 64 && pad.name.startsWith('DualSense')) {
      o = 1; l2 = buf[5]; r2 = buf[6]; b0 = buf[8]; b1 = buf[9]; b2 = buf[10];
    } else if (id === 0x01) {
      o = 1; b0 = buf[5]; b1 = buf[6]; b2 = buf[7]; l2 = buf[8]; r2 = buf[9];
    } else return;

    const lx = buf[o], ly = buf[o + 1], rx = buf[o + 2], ry = buf[o + 3];
    let buttons = 0;
    const hat = b0 & 0x0f; // 0=N, 1=NE ... 7=NO, 8=solto
    if (hat === 7 || hat === 0 || hat === 1) buttons |= B.UP;
    if (hat >= 1 && hat <= 3) buttons |= B.RIGHT;
    if (hat >= 3 && hat <= 5) buttons |= B.DOWN;
    if (hat >= 5 && hat <= 7) buttons |= B.LEFT;
    if (b0 & 0x10) buttons |= B.X;       // quadrado
    if (b0 & 0x20) buttons |= B.A;       // X (cross)
    if (b0 & 0x40) buttons |= B.B;       // círculo
    if (b0 & 0x80) buttons |= B.Y;       // triângulo
    if (b1 & 0x01) buttons |= B.LB;
    if (b1 & 0x02) buttons |= B.RB;
    if (b1 & 0x10) buttons |= B.BACK;    // Create / Share
    if (b1 & 0x20) buttons |= B.START;   // Options
    if (b1 & 0x40) buttons |= B.L3;
    if (b1 & 0x80) buttons |= B.R3;
    if (b2 & 0x01) buttons |= B.GUIDE;   // botão PS
    if (b2 & 0x02) buttons |= B.R3;      // clique no touchpad = clique do mouse
    // botão do microfone (só nos modos completos): comando de voz, como na TV
    const fullReport = id === 0x31 || (id === 0x01 && buf.length === 64);
    if (fullReport && b2 & 0x04) buttons |= MIC;
    if (fullReport) this.touch(pad, buf, o);

    this.handle(pad, {
      wButtons: buttons,
      bLeftTrigger: l2, bRightTrigger: r2,
      sThumbLX: (lx - 128) * 256, sThumbLY: (128 - ly) * 256,
      sThumbRX: (rx - 128) * 256, sThumbRY: (128 - ry) * 256
    }, Date.now());
  }

  poll() {
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      const pad = this.pads[i];
      // controles desconectados: só verificar a cada 2 s (XInput é lento nesse caso)
      if (!this.connected.has(i) && now - pad.lastScan < 2000) continue;
      pad.lastScan = now;
      const st = {};
      const r = this.getState(i, st);
      if (r !== 0) {
        if (this.connected.delete(i)) this.emit('status', this.count());
        continue;
      }
      if (!this.connected.has(i)) {
        this.connected.add(i);
        this.emit('status', this.count());
      }
      this.handle(pad, st.Gamepad, now);
    }
  }

  handle(pad, g, now) {
    let buttons = g.wButtons;
    // analógico esquerdo vira direcional
    if (g.sThumbLY > DEADZONE) buttons |= B.UP;
    if (g.sThumbLY < -DEADZONE) buttons |= B.DOWN;
    if (g.sThumbLX < -DEADZONE) buttons |= B.LEFT;
    if (g.sThumbLX > DEADZONE) buttons |= B.RIGHT;
    // gatilhos = volume, sensível à pressão: leve muda devagar, até o fim muda rápido
    this.trigger(pad, 'L', g.bLeftTrigger, -2, now);
    this.trigger(pad, 'R', g.bRightTrigger, +2, now);

    const pressed = buttons & ~pad.prev;

    // Back + Start = Home (para controles sem Guide acessível); Back sozinho = Voltar
    if ((buttons & (B.BACK | B.START)) === (B.BACK | B.START) && pressed & (B.BACK | B.START)) {
      this.emit('action', { type: 'home' });
    } else {
      if (pressed & B.BACK && !(buttons & B.START)) this.emit('action', { type: 'back' });
      for (const [mask, action] of PRESS) {
        if (mask === B.START && buttons & B.BACK) continue;
        if (pressed & mask) this.emit('action', action);
      }
    }

    for (const [mask, action] of REPEAT) {
      if (buttons & mask) {
        const h = pad.held[mask];
        if (!h) {
          pad.held[mask] = { next: now + FIRST_DELAY };
          this.emit('action', action);
        } else if (now >= h.next) {
          h.next = now + REPEAT_EVERY;
          this.emit('action', action);
        }
      } else {
        delete pad.held[mask];
      }
    }

    // analógico direito = rolar a página (inclinação = velocidade); o mouse fica no touchpad
    const rx = Math.abs(g.sThumbRX) > 9000 ? g.sThumbRX / 32767 : 0;
    const ry = Math.abs(g.sThumbRY) > 9000 ? g.sThumbRY / 32767 : 0;
    if ((rx || ry) && now - (pad.scrollSent || 0) >= 40) {
      pad.scrollSent = now;
      if (ry) this.emit('action', { type: 'scroll', amount: Math.sign(ry) * ry * ry * 160 });
      if (rx) this.emit('action', { type: 'hscroll', amount: Math.sign(rx) * rx * rx * 160 });
    }

    // segurar Guide/PS (ou Back+Start) por 1 s = voltar ao Sofá mesmo dentro de jogos na nuvem
    const homeHeld = buttons & B.GUIDE || (buttons & (B.BACK | B.START)) === (B.BACK | B.START);
    if (homeHeld) {
      if (!pad.homeSince) pad.homeSince = now;
      else if (!pad.homeLongSent && now - pad.homeSince >= 1000) { pad.homeLongSent = true; this.emit('action', { type: 'home', long: true }); }
    } else {
      pad.homeSince = 0;
      pad.homeLongSent = false;
    }

    pad.prev = buttons;
  }

  trigger(pad, side, value, step, now) {
    const key = 'trig' + side;
    if (value < 40) {
      pad[key] = null;
      return;
    }
    // intervalo de 320 ms (leve) a 45 ms (fundo)
    const k = (value - 40) / 215;
    const every = 320 - k * 275;
    if (!pad[key]) {
      pad[key] = { next: now + Math.max(every, 220) };
      this.emit('action', { type: 'volume', delta: step });
    } else if (now >= pad[key].next) {
      pad[key].next = now + every;
      this.emit('action', { type: 'volume', delta: step });
    }
  }

  // touchpad do DualSense como touchpad de notebook:
  //   um dedo move o cursor, dois dedos rolam, clicar no touchpad = clique
  touch(pad, buf, o) {
    const pt = (k) => {
      const b = o + 32 + k * 4;
      if (buf[b] === undefined || buf[b] & 0x80) return null; // bit 7 = sem toque
      return { x: buf[b + 1] | ((buf[b + 2] & 0x0f) << 8), y: (buf[b + 2] >> 4) | (buf[b + 3] << 4) };
    };
    const p1 = pt(0), p2 = pt(1);
    const fingers = (p1 ? 1 : 0) + (p2 ? 1 : 0);
    const prev = pad.touchPrev;
    pad.touchPrev = p1 ? { p1, p2, fingers } : null;
    if (!p1 || !prev || prev.fingers !== fingers) return; // começo do toque ou troca de dedos
    const dx = p1.x - prev.p1.x, dy = p1.y - prev.p1.y;
    if (fingers === 2) {
      pad.scrollAcc = (pad.scrollAcc || 0) - dy * 3;
    } else {
      const speed = 1.6 * (1 + Math.min(Math.hypot(dx, dy) / 12, 1.5)); // aceleração
      pad.mx = (pad.mx || 0) + dx * speed;
      pad.my = (pad.my || 0) + dy * speed;
    }
    const now = Date.now();
    if (now - (pad.touchSent || 0) < 8) return; // até ~120 envios/s
    pad.touchSent = now;
    if (Math.abs(pad.mx) >= 1 || Math.abs(pad.my) >= 1) {
      this.emit('action', { type: 'mouse', dx: pad.mx, dy: pad.my });
      pad.mx = pad.my = 0;
    }
    if (Math.abs(pad.scrollAcc || 0) >= 40) {
      this.emit('action', { type: 'scroll', amount: pad.scrollAcc });
      pad.scrollAcc = 0;
    }
  }
}

module.exports = Gamepad;
