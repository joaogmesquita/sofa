const $ = (s) => document.querySelector(s);
const AMBIENT_AFTER = 120000; // 2 min sem uso -> tela de transmissão

let services = [];
let focusables = [];
let focusIndex = 0;
let lastInput = Date.now();

// ---------- render ----------
async function loadServices() {
  services = await window.sofa.services();
  const box = $('#apps');
  box.innerHTML = '';
  services.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'card focusable' + (s.disabled ? ' disabled' : '');
    b.dataset.row = '0';
    b.dataset.id = s.id;
    b.style.setProperty('--c', s.color);
    b.innerHTML = `<span class="name"></span><span class="hint"></span>${s.disabled ? '<span class="badge">indisponível</span>' : ''}`;
    b.querySelector('.name').textContent = s.name;
    b.querySelector('.hint').textContent = s.hint;
    box.appendChild(b);
  });
  focusables = [...document.querySelectorAll('.focusable')];
  setFocus(Math.min(focusIndex, focusables.length - 1));
}

function setFocus(i) {
  focusables.forEach((el) => el.classList.remove('focused'));
  focusIndex = i;
  focusables[i]?.classList.add('focused');
}

function nav(dir) {
  const cur = focusables[focusIndex];
  if (!cur) return setFocus(0);
  const row = cur.dataset.row;
  const inRow = focusables.filter((el) => el.dataset.row === row);
  const pos = inRow.indexOf(cur);
  if (row === '0') {
    if (dir === 'left' && pos > 0) return setFocus(focusables.indexOf(inRow[pos - 1]));
    if (dir === 'right' && pos < inRow.length - 1) return setFocus(focusables.indexOf(inRow[pos + 1]));
    if (dir === 'down') return setFocus(focusables.indexOf(focusables.find((el) => el.dataset.row === '1')));
  } else {
    // botões laterais empilhados na vertical
    if (dir === 'down' && pos < inRow.length - 1) return setFocus(focusables.indexOf(inRow[pos + 1]));
    if (dir === 'up' && pos > 0) return setFocus(focusables.indexOf(inRow[pos - 1]));
    if (dir === 'up' || dir === 'left') {
      const apps = focusables.filter((el) => el.dataset.row === '0');
      return setFocus(focusables.indexOf(apps[apps.length - 1]));
    }
  }
}

function activate(el) {
  if (!el) return;
  if (el.dataset.id) {
    const s = services.find((x) => x.id === el.dataset.id);
    if (s.disabled) return toast(`${s.name}: ${s.hint}`);
    toast(`Abrindo ${s.name}…`);
    window.sofa.send({ type: 'launch', id: s.id });
  } else if (el.dataset.act === 'quit') window.sofa.quit();
  else if (el.dataset.act === 'refresh') loadServices().then(() => toast('Atualizado'));
  else if (el.dataset.act === 'ambient') showAmbient(true);
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
  else if (action.type === 'ok') activate(focusables[focusIndex]);
}
window.sofa.onAction(handle);

const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.key]) { e.preventDefault(); handle({ type: 'nav', dir: KEYMAP[e.key] }); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle({ type: 'ok' }); }
  else anyInput();
});

let cursorTimer;
document.addEventListener('mousemove', (e) => {
  anyInput();
  document.body.classList.remove('nocursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('nocursor'), 2500);
  const el = e.target.closest('.focusable');
  if (el) setFocus(focusables.indexOf(el));
});
document.addEventListener('click', (e) => {
  if (anyInput()) return;
  const el = e.target.closest('.focusable');
  if (el) activate(el);
});
$('#ambient').addEventListener('click', () => anyInput());

// ---------- status ----------
function applyStatus(s) {
  $('#st-pad b').textContent = s.gamepads;
  $('#st-phone b').textContent = s.phones;
  $('#st-cast').classList.toggle('off', !s.cast);
  $('#remote-url').textContent = s.remoteUrl.replace('http://', '');
  document.querySelectorAll('.dev-name').forEach((el) => (el.textContent = s.deviceName));
  if (s.active === null && !document.hidden) lastInput = Date.now();
}
window.sofa.onStatus(applyStatus);

function tick() {
  const now = new Date();
  const hm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#clock').textContent = hm;
  $('#amb-clock').textContent = hm;
  $('#amb-date').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(tick, 1000);
tick();

(async () => {
  const s = await window.sofa.status();
  applyStatus(s);
  $('#qr').src = s.qr;
  $('#amb-qr').src = s.qr;
  await loadServices();
})();
