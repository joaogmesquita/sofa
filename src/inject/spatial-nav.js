// Navegação espacial para sites feitos para mouse (Netflix, Prime, Disney+).
// Setas movem o foco para o elemento mais próximo naquela direção; OK clica.
// No player em tela cheia devolve false, e o Sofá repassa as teclas ao site.
(() => {
  if (window.__sofa) return;

  const SELECTOR = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
    '[role="option"]', '[role="checkbox"]', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  let current = null;
  const ring = document.createElement('div');
  ring.id = '__sofa-ring';
  Object.assign(ring.style, {
    position: 'fixed', zIndex: 2147483647, pointerEvents: 'none', display: 'none',
    border: '4px solid #fff', borderRadius: '10px',
    boxShadow: '0 0 0 3px rgba(0,0,0,.6), 0 0 24px 6px rgba(255,255,255,.35)',
    transition: 'all .12s ease-out'
  });

  const api = (window.__sofa = {});
  // permite que scripts por site acrescentem filtros e seletores
  api.extraSelector = '';
  api.ignore = (el) => false;
  api.scope = () => document; // raiz onde procurar itens (ex.: só dentro de um diálogo aberto)
  api.hover = true;           // simula mouseover ao focar (desligado na Netflix: abre prévias por cima)

  function attachRing() {
    if (!ring.isConnected && document.body) document.body.appendChild(ring);
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (el.disabled || el.closest('[aria-hidden="true"],[inert]')) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    // descarta elementos muito fora da tela (carrosséis virtualizados)
    if (r.bottom < -innerHeight || r.top > innerHeight * 2) return false;
    if (r.right < -innerWidth || r.left > innerWidth * 2) return false;
    return true;
  }

  function candidates() {
    const sel = api.extraSelector ? SELECTOR + ',' + api.extraSelector : SELECTOR;
    const all = [...(api.scope() || document).querySelectorAll(sel)].filter((el) => visible(el) && !api.ignore(el));
    // evita escolher um item e também o filho dele: mantém o elemento mais externo
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el) && o.matches(SELECTOR)));
  }

  function playerMode() {
    const area = innerWidth * innerHeight;
    return [...document.querySelectorAll('video')].some((v) => {
      const r = v.getBoundingClientRect();
      return r.width * r.height > area * 0.85 && v.readyState > 0;
    });
  }

  function center(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function score(from, to, dir) {
    const a = center(from), b = center(to);
    let primary, ortho;
    if (dir === 'up') { primary = from.top - to.bottom; ortho = Math.abs(a.x - b.x); if (b.y >= a.y - 2) return Infinity; }
    if (dir === 'down') { primary = to.top - from.bottom; ortho = Math.abs(a.x - b.x); if (b.y <= a.y + 2) return Infinity; }
    if (dir === 'left') { primary = from.left - to.right; ortho = Math.abs(a.y - b.y); if (b.x >= a.x - 2) return Infinity; }
    if (dir === 'right') { primary = to.left - from.right; ortho = Math.abs(a.y - b.y); if (b.x <= a.x + 2) return Infinity; }
    // sobreposição no eixo perpendicular conta muito a favor
    const overlap = dir === 'up' || dir === 'down'
      ? Math.min(from.right, to.right) - Math.max(from.left, to.left)
      : Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
    return Math.max(primary, 0) + ortho * (overlap > 0 ? 0.3 : 2.5);
  }

  function setFocus(el, scroll = true) {
    current = el;
    try { el.focus({ preventScroll: true }); } catch {}
    if (scroll) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    // hover: alguns sites mostram detalhes ao passar o mouse
    if (api.hover) {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    }
    attachRing();
    ring.style.display = 'block';
  }

  function updateRing() {
    if (current && current.isConnected && visible(current)) {
      const r = current.getBoundingClientRect();
      Object.assign(ring.style, {
        left: r.left - 6 + 'px', top: r.top - 6 + 'px',
        width: r.width + 12 + 'px', height: r.height + 12 + 'px'
      });
    } else {
      ring.style.display = 'none';
    }
    requestAnimationFrame(updateRing);
  }
  requestAnimationFrame(updateRing);

  // o mouse real esconde o anel
  window.addEventListener('mousemove', (e) => { if (e.isTrusted && e.movementX + e.movementY !== 0) ring.style.display = 'none'; }, true);

  function firstInView(list) {
    return list
      .filter((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })
      .sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); })[0] || list[0];
  }

  // ganchos para scripts por site
  api.focusEl = setFocus;
  api.current = () => (current && current.isConnected && ring.style.display !== 'none' ? current : null);
  api.isPlayer = playerMode;
  api.visible = visible;

  api.nav = (dir) => {
    if (api.isPlayer()) return false;
    const list = candidates();
    if (!list.length) return false;
    if (!current || !current.isConnected || !visible(current) || ring.style.display === 'none') {
      const active = document.activeElement;
      const start = active && active !== document.body && list.includes(active) ? active : firstInView(list);
      if (start) setFocus(start);
      return true;
    }
    const from = current.getBoundingClientRect();
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const s = score(from, el.getBoundingClientRect(), dir);
      if (s < bestScore) { bestScore = s; best = el; }
    }
    if (best) setFocus(best);
    else window.scrollBy({ top: dir === 'down' ? innerHeight * 0.6 : dir === 'up' ? -innerHeight * 0.6 : 0, behavior: 'smooth' });
    return true;
  };

  api.ok = () => {
    if (api.isPlayer()) return false;
    if (!current || !current.isConnected) return api.nav('down');
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(current.tagName)) { current.focus(); return true; }
    rememberArt(current);
    current.click();
    return true;
  };

  // guarda a arte do título escolhido: vira o "modo ambiente" nos sites com DRM
  // (o vídeo protegido não pode ser lido) e a miniatura do "Continuar assistindo"
  function rememberArt(el) {
    const pick = (root) => {
      if (!root) return null;
      const imgs = [...root.querySelectorAll('img')].filter((i) => i.naturalWidth >= 200 && (i.currentSrc || i.src).startsWith('http'));
      imgs.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
      return imgs[0] ? imgs[0].currentSrc || imgs[0].src : null;
    };
    const art = pick(el) || pick(el.closest('section, [class*="billboard"], [data-uia*="billboard"]'));
    if (art) try { sessionStorage.setItem('__sofaArt', art); } catch {}
  }
  api.rememberArt = rememberArt;

  api.back = () => {
    if (document.fullscreenElement) { document.exitFullscreen(); return true; }
    if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { document.activeElement.blur(); return true; }
    history.back();
    return true;
  };
})();
