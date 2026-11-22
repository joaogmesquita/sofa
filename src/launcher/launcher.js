const $ = (s) => document.querySelector(s);
const AMBIENT_AFTER = 120000; // 2 min sem uso -> tela de transmissão

const ICON = {
  cast: '<svg viewBox="0 0 24 24"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6v-2h6V5H5v3H3V5Zm0 5a9 9 0 0 1 9 9h-2a7 7 0 0 0-7-7v-2Zm0 4a5 5 0 0 1 5 5H6a3 3 0 0 0-3-3v-2Zm0 4a1 1 0 0 1 1 1H3v-1Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 7.4 5H17v2h6V5h-2v2.3A10 10 0 1 0 22 12h-2a8 8 0 1 1-8-8Z"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M11 2h2v10h-2V2Zm-4.2 3.4 1.4 1.4A6 6 0 1 0 15.8 6.8l1.4-1.4A8 8 0 1 1 6.8 5.4Z"/></svg>'
};

let services = [];
let recents = [];
let rows = [];            // [{ id, title, items: [{ kind, data, el }] }]
let focus = { row: 0, col: 0 };
const lastCol = {};
let lastInput = Date.now();

const fmtMin = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- montagem ----------
function build() {
  const prev = currentItem();
  rows = [];
  if (recents.length) {
    rows.push({ id: 'recents', title: 'Continuar assistindo', items: recents.map((r) => ({ kind: 'recent', data: r })) });
  }
  rows.push({
    id: 'apps',
    title: 'Apps',
    items: [
      ...services.map((s) => ({ kind: 'app', data: s })),
      { kind: 'util', data: { id: 'ambient', name: 'Transmitir', icon: ICON.cast } },
      { kind: 'util', data: { id: 'refresh', name: 'Atualizar', icon: ICON.refresh } },
      { kind: 'util', data: { id: 'quit', name: 'Sair', icon: ICON.power } }
    ]
  });

  const box = $('#rows');
  box.innerHTML = '';
  rows.forEach((row, ri) => {
    const sec = document.createElement('div');
    sec.className = 'row';
    sec.innerHTML = `<h3>${esc(row.title)}</h3><div class="viewport"><div class="track"></div></div>`;
    const track = sec.querySelector('.track');
    row.items.forEach((it, ci) => {
      const el = document.createElement('button');
      el.className = 'tile ' + it.kind;
      el.dataset.row = ri;
      el.dataset.col = ci;
      if (it.kind === 'app') {
        el.style.setProperty('--c', it.data.color);
        if (it.data.disabled) el.classList.add('disabled');
        if (it.data.icon) el.classList.add('has-icon');
        el.innerHTML = (it.data.icon ? `<img class="icon" src="${it.data.icon}" alt=""><span class="label">${esc(it.data.name)}</span>` : `<span class="name">${esc(it.data.name)}</span>`) +
          (it.data.disabled ? '<span class="badge">indisponível</span>' : '');
      } else if (it.kind === 'util') {
        el.innerHTML = `${it.data.icon}<span>${esc(it.data.name)}</span>`;
      } else {
        const r = it.data;
        el.style.setProperty('--c', r.color);
        if (r.image) el.style.backgroundImage = `url("${r.image.replace(/"/g, '')}")`;
        else el.classList.add('noimg');
        const pct = r.duration ? Math.min(100, (r.time / r.duration) * 100) : 0;
        el.innerHTML = `${r.image ? '' : `<span class="noimg-word">${esc(r.serviceName)}</span>`}
          <span class="info"><span class="t">${esc(r.title)}</span><span class="s"><i></i>${esc(r.serviceName)}${r.duration ? ' · faltam ' + fmtMin(r.duration - r.time) : ''}</span></span>
          ${pct ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}`;
      }
      it.el = el;
      track.appendChild(el);
    });
    row.sec = sec;
    row.track = track;
    box.appendChild(sec);
  });

  // mantém o foco no mesmo item depois de recarregar
  let target = null;
  if (prev) {
    rows.forEach((row, ri) => row.items.forEach((it, ci) => {
      if (!target && it.kind === prev.kind && (it.data.id || it.data.key) === (prev.data.id || prev.data.key)) target = { row: ri, col: ci };
    }));
  }
  if (!target) {
    const appsRow = rows.findIndex((r) => r.id === 'apps');
    target = { row: rows.length > 1 && focus.row === 0 && !prev ? 0 : appsRow, col: 0 };
    if (!prev) target = { row: 0, col: 0 };
  }
  setFocus(target.row, target.col, true);
}

function currentItem() {
  return rows[focus.row]?.items[focus.col];
}

function setFocus(r, c, force = false) {
  r = Math.max(0, Math.min(rows.length - 1, r));
  const row = rows[r];
  if (!row) return;
  c = Math.max(0, Math.min(row.items.length - 1, c));
  if (!force && r === focus.row && c === focus.col) return;
  document.querySelectorAll('.tile.focused').forEach((el) => el.classList.remove('focused'));
  document.querySelectorAll('.row.active').forEach((el) => el.classList.remove('active'));
  focus = { row: r, col: c };
  lastCol[row.id] = c;
  const it = row.items[c];
  it.el.classList.add('focused');
  row.sec.classList.add('active');
  $('#rows').classList.toggle('dim', rows.length > 1);
  scrollRow(row, c);
  updateHero(it);
}

// a linha anda para manter o item em foco visível (foco fica à esquerda, estilo TV)
function scrollRow(row, c) {
  const el = row.items[c].el;
  const vw = row.sec.querySelector('.viewport').clientWidth;
  const padPx = parseFloat(getComputedStyle(row.sec.querySelector('.viewport')).paddingLeft);
  const left = el.offsetLeft;
  const total = row.track.scrollWidth;
  const maxShift = Math.max(0, total - (vw - padPx * 2));
  const shift = Math.min(maxShift, Math.max(0, left - el.offsetWidth * 0.6));
  row.track.style.transform = `translateX(${-shift}px)`;
}

// ---------- hero + fundo ----------
let bgFlip = false;
let bgKey = '';
function setBackground(key, { image, color, word }) {
  if (key === bgKey) return;
  bgKey = key;
  bgFlip = !bgFlip;
  const on = $(bgFlip ? '#bg-a' : '#bg-b');
  const off = $(bgFlip ? '#bg-b' : '#bg-a');
  on.className = 'bg-layer' + (image ? ' photo' : '');
  if (image) {
    on.style.background = `url("${image.replace(/"/g, '')}") center 30% / cover no-repeat`;
    on.innerHTML = '';
  } else {
    on.style.background = `radial-gradient(70% 90% at 78% 30%, color-mix(in srgb, ${color} 75%, transparent), transparent 70%),
      radial-gradient(50% 60% at 95% 85%, color-mix(in srgb, ${color} 40%, transparent), transparent 70%), #07080c`;
    on.innerHTML = word ? `<span class="word">${esc(word)}</span>` : '';
  }
  requestAnimationFrame(() => { on.classList.add('on'); off.classList.remove('on'); });
}

function chip(key, text) {
  return `<span class="chip"><kbd>${key}</kbd>${esc(text)}</span>`;
}

function updateHero(it) {
  const hero = $('#hero');
  let eyebrow, title, meta, color, chips, progress = 0, heroIcon = null;
  if (it.kind === 'app') {
    const s = it.data;
    const last = recents.find((r) => r.service === s.id);
    eyebrow = 'App';
    heroIcon = s.icon;
    title = s.name;
    color = s.color;
    meta = s.disabled ? s.hint : last ? `Continuar: ${last.title}` : s.hint;
    chips = chip('A', 'Abrir') + chip('🎤', `diga “abrir ${s.name}”`);
    setBackground('app:' + s.id, { color, word: s.name });
  } else if (it.kind === 'recent') {
    const r = it.data;
    eyebrow = r.serviceName;
    heroIcon = services.find((x) => x.id === r.service)?.icon;
    title = r.title;
    color = r.color;
    meta = [r.subtitle, r.duration ? `faltam ${fmtMin(r.duration - r.time)}` : ''].filter(Boolean).join(' · ');
    progress = r.duration ? (r.time / r.duration) * 100 : 0;
    chips = chip('A', 'Continuar') + chip('X', 'Remover da lista');
    setBackground('rec:' + r.key, { image: r.image, color, word: r.serviceName });
  } else {
    const u = it.data;
    color = '#7c9cff';
    eyebrow = 'Sofá';
    title = { ambient: 'Transmitir do celular', refresh: 'Atualizar', quit: 'Sair do Sofá' }[u.id];
    meta = {
      ambient: 'No app do YouTube, toque em Transmitir e escolha Sofá (PC). No Jellyfin, escolha a sessão deste PC.',
      refresh: 'Recarrega a lista de apps e verifica o servidor do Jellyfin.',
      quit: 'Fecha o launcher e os apps abertos.'
    }[u.id];
    chips = chip('A', 'Selecionar');
    setBackground('util', { color, word: '' });
  }
  hero.style.setProperty('--c', color);
  $('#hero-eyebrow').textContent = eyebrow;
  const hi = $('#hero-icon');
  hi.hidden = !heroIcon;
  if (heroIcon) hi.src = heroIcon;
  hero.classList.toggle('with-icon', !!heroIcon);
  $('#hero-title').textContent = title;
  $('#hero-meta').textContent = meta || '';
  $('#hero-progress').classList.toggle('on', progress > 0);
  $('#hero-progress i').style.width = progress + '%';
  $('#hero-chips').innerHTML = chips;
  hero.classList.remove('swap');
  void hero.offsetWidth;
  hero.classList.add('swap');
}

// ---------- ações ----------
function activate(it) {
  if (!it) return;
  if (it.kind === 'app') {
    if (it.data.disabled) return toast(`${it.data.name}: ${it.data.hint}`);
    toast(`Abrindo ${it.data.name}…`);
    window.sofa.send({ type: 'launch', id: it.data.id });
  } else if (it.kind === 'recent') {
    toast(`Continuando ${it.data.title}…`);
    window.sofa.send({ type: 'launch', id: it.data.service, url: it.data.url });
  } else if (it.data.id === 'quit') window.sofa.quit();
  else if (it.data.id === 'refresh') reload().then(() => toast('Atualizado'));
  else if (it.data.id === 'ambient') showAmbient(true);
}

function nav(dir) {
  if (dir === 'left') return setFocus(focus.row, focus.col - 1);
  if (dir === 'right') return setFocus(focus.row, focus.col + 1);
  const r = focus.row + (dir === 'down' ? 1 : -1);
  if (!rows[r]) return;
  setFocus(r, lastCol[rows[r].id] ?? 0);
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- tela de transmissão ----------
function showAmbient(on) {
  $('#ambient').hidden = !on;
}
function anyInput() {
  lastInput = Date.now();
  if (!$('#ambient').hidden) {
    showAmbient(false);
    return true; // o primeiro toque só acorda a tela
  }
  return false;
}
setInterval(() => {
  if (Date.now() - lastInput > AMBIENT_AFTER && document.hasFocus()) showAmbient(true);
}, 5000);

// ---------- entradas ----------
function handle(action) {
  if (anyInput()) return;
  if (action.type === 'nav') nav(action.dir);
  else if (action.type === 'ok') activate(currentItem());
  else if (action.type === 'playpause') {
    const it = currentItem();
    if (it?.kind === 'recent') { window.sofa.removeRecent(it.data.key); toast('Removido de “Continuar assistindo”'); }
  }
}
window.sofa.onAction(handle);

const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.key]) { e.preventDefault(); handle({ type: 'nav', dir: KEYMAP[e.key] }); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle({ type: 'ok' }); }
  else if (e.key === 'Delete' || e.key === 'x') handle({ type: 'playpause' });
  else anyInput();
});

let cursorTimer;
document.addEventListener('mousemove', (e) => {
  anyInput();
  document.body.classList.remove('nocursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('nocursor'), 2500);
  const el = e.target.closest('.tile');
  if (el) setFocus(+el.dataset.row, +el.dataset.col);
});
document.addEventListener('click', (e) => {
  if (anyInput()) return;
  const el = e.target.closest('.tile');
  if (el) activate(rows[+el.dataset.row]?.items[+el.dataset.col]);
});
document.addEventListener('wheel', (e) => nav(e.deltaY > 0 ? 'right' : 'left'), { passive: true });

// ---------- status ----------
function applyStatus(s) {
  $('#st-pad b').textContent = s.gamepads;
  $('#st-phone b').textContent = s.phones;
  $('#st-pad').classList.toggle('off', !s.gamepads);
  $('#st-phone').classList.toggle('off', !s.phones);
  $('#st-cast').classList.toggle('off', !s.cast);
  $('#remote-url').textContent = s.remoteUrl.replace('http://', '');
  document.querySelectorAll('.dev-name').forEach((el) => (el.textContent = s.deviceName));
  if (s.active === null && !document.hidden) lastInput = Date.now();
}
window.sofa.onStatus(applyStatus);
window.sofa.onRecents(async (r) => { await setRecents(r); build(); });
window.sofa.onServicesChanged(() => reload());

function tick() {
  const now = new Date();
  const hm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#clock').textContent = hm;
  $('#amb-clock').textContent = hm;
  $('#amb-date').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(tick, 1000);
tick();

// o YouTube devolve uma imagem cinza de 120 px quando não há miniatura: descarta
const imgOk = {};
function checkImages(list) {
  return Promise.all(list.map((r) => {
    if (!r.image || r.image in imgOk) return null;
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { imgOk[r.image] = im.naturalWidth > 130; res(); };
      im.onerror = () => { imgOk[r.image] = false; res(); };
      im.src = r.image;
    });
  }));
}
async function setRecents(list) {
  await checkImages(list);
  recents = list.map((r) => (r.image && !imgOk[r.image] ? { ...r, image: null } : r));
}

async function reload() {
  const [s, r] = await Promise.all([window.sofa.services(), window.sofa.recents()]);
  services = s;
  await setRecents(r);
  build();
}

(async () => {
  const s = await window.sofa.status();
  applyStatus(s);
  $('#qr').src = s.qr;
  $('#amb-qr').src = s.qr;
  await reload();
})();
window.addEventListener('resize', () => rows[focus.row] && scrollRow(rows[focus.row], focus.col));
