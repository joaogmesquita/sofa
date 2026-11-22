let ws;
let queue = [];

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    document.getElementById('dot').classList.add('on');
    queue.forEach((m) => ws.send(m));
    queue = [];
  };
  ws.onclose = () => {
    document.getElementById('dot').classList.remove('on');
    document.getElementById('now').textContent = 'reconectando…';
    setTimeout(connect, 1500);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') render(msg.state);
  };
}

function send(action) {
  const m = JSON.stringify({ type: 'action', action });
  if (ws && ws.readyState === 1) ws.send(m);
  else queue.push(m);
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function render(state) {
  document.getElementById('now').textContent = state.active ? `▶ ${state.active}` : 'No menu do Sofá';
  const box = document.getElementById('apps');
  if (state.services && box.childElementCount !== state.services.length) {
    box.innerHTML = '';
    for (const s of state.services) {
      const b = document.createElement('button');
      b.className = 'app';
      b.style.setProperty('--c', s.color);
      b.textContent = s.name;
      b.dataset.name = s.name;
      b.onclick = () => { buzz(); send({ type: 'launch', id: s.id }); };
      box.appendChild(b);
    }
  }
  box.querySelectorAll('.app').forEach((b) => b.classList.toggle('active', b.dataset.name === state.active));
}

// botões com data-a (e repetição ao segurar quando data-repeat)
document.querySelectorAll('[data-a]').forEach((el) => {
  const action = JSON.parse(el.dataset.a);
  let t1, t2;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    buzz();
    send(action);
    if (el.hasAttribute('data-repeat')) {
      t1 = setTimeout(() => (t2 = setInterval(() => send(action), 110)), 400);
    }
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, stop));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
});

// abas
document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll('.tab, .view').forEach((x) => x.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  };
});

// touchpad
const area = document.getElementById('pad-area');
let touches = {};
let moved = 0;
let startTime = 0;
let accum = { x: 0, y: 0, s: 0 };
let raf = null;
function flush() {
  raf = null;
  if (accum.x || accum.y) send({ type: 'mouse', dx: accum.x, dy: accum.y });
  if (accum.s) send({ type: 'scroll', amount: accum.s });
  accum = { x: 0, y: 0, s: 0 };
}
area.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
  if (e.touches.length === 1) { moved = 0; startTime = Date.now(); }
}, { passive: false });
area.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const n = e.touches.length;
  for (const t of e.changedTouches) {
    const p = touches[t.identifier];
    if (!p) continue;
    const dx = t.clientX - p.x, dy = t.clientY - p.y;
    p.x = t.clientX; p.y = t.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (n >= 2) accum.s += -dy * 6 / n;
    else {
      const speed = 1 + Math.min(Math.hypot(dx, dy) / 8, 2.5); // aceleração
      accum.x += dx * 1.8 * speed;
      accum.y += dy * 1.8 * speed;
    }
  }
  if (!raf) raf = requestAnimationFrame(flush);
}, { passive: false });
area.addEventListener('touchend', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) delete touches[t.identifier];
  if (e.touches.length === 0 && moved < 8 && Date.now() - startTime < 250) { buzz(); send({ type: 'click', button: 'left' }); }
}, { passive: false });

// teclado: Enter/Comando interpreta como comando de voz; "Digitar na TV" manda o texto cru
const input = document.getElementById('text');
document.getElementById('text-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value.trim()) { buzz(); send({ type: 'command', text: input.value }); }
  input.value = '';
});
document.getElementById('type-btn').addEventListener('click', () => {
  if (input.value) { buzz(); send({ type: 'text', text: input.value }); }
  input.value = '';
});
// botão de voz do controle: abre a aba de teclado já com o campo focado
document.getElementById('mic-btn').addEventListener('click', () => {
  buzz();
  document.querySelector('.tab[data-tab="kbd"]').click();
  input.focus();
});

connect();
