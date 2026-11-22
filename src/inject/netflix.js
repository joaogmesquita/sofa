// Netflix (layout 2026): navegação por linhas, como no app de TV.
//   zonas na vertical: menu do topo -> destaque (Assistir / Mais informações) -> carrosséis
//   ←/→ anda na linha e vira a página do carrossel ao chegar na borda
//   com um diálogo aberto (detalhes do título), a navegação fica presa nele
(() => {
  const api = window.__sofa;
  if (!api || api.netflix) return;
  api.netflix = true;
  api.hover = false; // mouseover abre prévias que cobrem a tela
  // o trailer do destaque ocupa a página toda; o player de verdade é só em /watch
  api.isPlayer = () => location.pathname.startsWith('/watch');

  const CARD = 'a[data-uia$="-card"]';
  const ROW = 'section[data-uia^="carousel-row-section"]';
  const rect = (e) => e.getBoundingClientRect();
  const shown = (e) => { const r = rect(e); return r.width > 20 && r.height > 20 && getComputedStyle(e).visibility !== 'hidden'; };
  const byLeft = (a, b) => rect(a).left - rect(b).left;
  const inView = (e) => { const r = rect(e); return r.left >= -8 && r.right <= innerWidth + 8; };
  const cx = (e) => { const r = rect(e); return r.left + r.width / 2; };

  function dialog() {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-uia*="modal"]')]
      .find((d) => { const r = rect(d); return r.width > innerWidth * 0.3 && r.height > innerHeight * 0.3; }) || null;
  }
  api.scope = () => dialog() || document;

  const docTop = (e) => rect(e).top + scrollY;

  // zonas em ordem vertical real: menu do topo primeiro, depois destaques e carrosséis
  function zones() {
    const z = [];
    const nav = [...document.querySelectorAll('[data-uia="navigation"] a[href], [data-uia="navigation"] button')].filter(shown).sort(byLeft);
    // destaques (pode haver vários na página): agrupa Assistir + Mais informações pela altura
    const bbs = [...document.querySelectorAll('[data-uia="play-video-button"], [data-uia="billboard-more-info"]')]
      .filter((e) => shown(e) && !e.closest(ROW) && !e.closest('[role="dialog"]'))
      .sort((a, b) => docTop(a) - docTop(b));
    const groups = [];
    for (const b of bbs) {
      const g = groups.find((x) => Math.abs(x.top - docTop(b)) < 80);
      if (g) g.items.push(b); else groups.push({ top: docTop(b), items: [b] });
    }
    groups.forEach((g, i) => z.push({ type: 'billboard', key: 'bb' + i, top: g.top, items: g.items.sort(byLeft) }));
    for (const sec of document.querySelectorAll(ROW)) {
      // linhas de Top 10 têm dois links sobrepostos por título: fica só um por posição
      const cards = [...sec.querySelectorAll(CARD)].filter(shown).sort(byLeft)
        .filter((c, i, arr) => i === 0 || Math.abs(rect(c).left - rect(arr[i - 1]).left) > 8);
      if (cards.length) z.push({ type: 'row', key: sec.getAttribute('data-uia'), el: sec, top: docTop(sec), items: cards });
    }
    z.sort((a, b) => a.top - b.top);
    if (nav.length) z.unshift({ type: 'nav', key: 'nav', items: nav });
    return z;
  }

  function pageCarousel(sec, side) {
    const btn = sec.querySelector(`[data-uia="carousel-hawkins-${side}-button"]`);
    if (btn) btn.click();
  }

  // a Netflix recria o card ao focar; guardamos a posição lógica (zona + índice + x)
  let pos = null;

  function focusZoneItem(zone, el) {
    pos = { key: zone.key, i: zone.items.indexOf(el), x: cx(el) };
    api.focusEl(el, false);
    if (zone.type === 'nav') return window.scrollTo({ top: 0, behavior: 'smooth' });
    const r = rect(zone.el || el);
    if (r.top < innerHeight * 0.15 || r.bottom > innerHeight * 0.92) {
      window.scrollBy({ top: r.top - innerHeight * 0.38, behavior: 'smooth' });
    }
  }

  function locate(zs) {
    const cur = api.current();
    if (cur) {
      const zi = zs.findIndex((z) => z.items.includes(cur));
      if (zi >= 0) return { zi, i: zs[zi].items.indexOf(cur), x: cx(cur) };
    }
    if (pos) {
      const zi = zs.findIndex((z) => z.key === pos.key);
      if (zi >= 0) return { zi, i: Math.min(pos.i, zs[zi].items.length - 1), x: pos.x };
    }
    return null;
  }

  function rowNav(dir) {
    const zs = zones();
    if (!zs.length) return null;
    const at = locate(zs);
    if (!at) {
      // primeiro toque: primeira linha de títulos visível (ou o destaque)
      const first = zs.find((z) => z.type === 'row' && rect(z.el).top > 0 && rect(z.el).top < innerHeight) || zs.find((z) => z.type === 'billboard') || zs[0];
      focusZoneItem(first, first.items.find(inView) || first.items[0]);
      return true;
    }
    const zone = zs[at.zi];
    if (dir === 'left' || dir === 'right') {
      const next = zone.items[at.i + (dir === 'right' ? 1 : -1)];
      if (!next) return true;
      if (zone.type === 'row') {
        const r = rect(next);
        if (dir === 'right' && r.right > innerWidth - 12) pageCarousel(zone.el, 'right');
        if (dir === 'left' && r.left < 12) pageCarousel(zone.el, 'left');
      }
      focusZoneItem(zone, next);
      return true;
    }
    const target = zs[at.zi + (dir === 'down' ? 1 : -1)];
    if (!target) return true;
    const pool = target.type === 'row' ? target.items.filter(inView) : target.items;
    const best = (pool.length ? pool : target.items).reduce((a, b) => (Math.abs(cx(b) - at.x) < Math.abs(cx(a) - at.x) ? b : a));
    focusZoneItem(target, best);
    return true;
  }

  const baseNav = api.nav;
  api.nav = (dir) => {
    if (api.isPlayer()) return false;            // player: setas vão para a Netflix (buscar/volume)
    if (dialog()) return baseNav(dir);           // detalhes do título: navegação espacial dentro do diálogo
    const r = rowNav(dir);
    return r === null ? baseNav(dir) : r;        // telas sem carrossel (perfis, busca): genérica
  };

  const baseBack = api.back;
  api.back = () => {
    const d = dialog();
    if (d) {
      const close = [...d.querySelectorAll('button, [role="button"]')].find((b) => /fechar|close/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      if (close) close.click();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      return true;
    }
    return baseBack();
  };
})();
