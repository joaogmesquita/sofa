// Modo ambiente para ultrawide: nas faixas laterais de um vídeo 16:9, mostra as
// cores da borda do vídeo esticadas e desfocadas (estilo Ambilight), em vez de preto.
// Só funciona em vídeo sem DRM (YouTube, Jellyfin): com DRM o navegador entrega pixels pretos.
(() => {
  if (window.__sofaAmbientOn) return;
  window.__sofaAmbientOn = true;

  const SAMPLE_W = 48, SAMPLE_H = 27; // amostra pequena: barato para a GPU
  const FPS = 15;

  const make = (side) => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = SAMPLE_H;
    Object.assign(c.style, {
      position: 'fixed', top: '0', height: '100vh', zIndex: 2147483646, pointerEvents: 'none', display: 'none',
      filter: 'blur(28px) saturate(1.3) brightness(.7)', transform: 'scale(1.15)',
      [side]: '0'
    });
    return c;
  };
  const left = make('left');
  const right = make('right');
  const sample = document.createElement('canvas');
  sample.width = SAMPLE_W; sample.height = SAMPLE_H;
  const sctx = sample.getContext('2d', { willReadFrequently: false });

  function hide() { left.style.display = right.style.display = 'none'; }

  function frame() {
    try {
      const v = [...document.querySelectorAll('video')].find((x) => !x.paused && x.videoWidth && x.getBoundingClientRect().width > innerWidth * 0.6);
      const mode = window.__sofaAspectMode ? window.__sofaAspectMode() : 'contain';
      if (!v || mode !== 'contain' || innerWidth / innerHeight < 1.9) return hide();
      // área real do vídeo na tela (object-fit: contain)
      const r = v.getBoundingClientRect();
      const va = v.videoWidth / v.videoHeight;
      const shownW = Math.min(r.width, r.height * va);
      const shownLeft = r.left + (r.width - shownW) / 2;
      const bar = shownLeft;
      if (bar < 40) return hide();
      for (const c of [left, right]) {
        if (!c.isConnected) document.body.appendChild(c);
        c.style.width = bar + 'px';
        c.style.display = 'block';
      }
      right.style.left = shownLeft + shownW + 'px';
      sctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
      // colunas da borda esquerda e direita do vídeo viram as laterais
      left.getContext('2d').drawImage(sample, 0, 0, 6, SAMPLE_H, 0, 0, 8, SAMPLE_H);
      right.getContext('2d').drawImage(sample, SAMPLE_W - 6, 0, 6, SAMPLE_H, 0, 0, 8, SAMPLE_H);
    } catch {
      hide(); // vídeo protegido ou ainda carregando
    }
  }
  setInterval(frame, 1000 / FPS);
})();
