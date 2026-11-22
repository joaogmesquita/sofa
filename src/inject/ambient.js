// Modo ambiente para ultrawide: preenche as faixas laterais de um vídeo 16:9.
//   - vídeo sem DRM (YouTube, Jellyfin...): cores da borda do vídeo em tempo real (estilo Ambilight)
//   - vídeo com DRM (Netflix, Prime, Disney+): o navegador entrega pixels pretos, então usamos
//     a arte do título escolhido (guardada pela navegação), desfocada nas laterais
(() => {
  if (window.__sofaAmbientOn) return;
  window.__sofaAmbientOn = true;

  const SAMPLE_W = 48, SAMPLE_H = 27; // amostra pequena: barato para a GPU
  const FPS = 15;
  const BLACK_FRAMES = 25;           // ~1,7 s de preto absoluto com o vídeo tocando = DRM

  const glass = { position: 'fixed', top: '0', height: '100vh', zIndex: 2147483646, pointerEvents: 'none', display: 'none' };
  const make = (side) => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = SAMPLE_H;
    Object.assign(c.style, glass, { filter: 'blur(28px) saturate(1.3) brightness(.7)', transform: 'scale(1.15)', [side]: '0' });
    return c;
  };
  const makeArt = (side) => {
    const d = document.createElement('div');
    Object.assign(d.style, glass, {
      backgroundSize: 'cover', backgroundPosition: side === 'left' ? 'left center' : 'right center',
      filter: 'blur(42px) saturate(1.25) brightness(.55)', transform: 'scale(1.2)', transition: 'opacity .8s', [side]: '0'
    });
    return d;
  };
  const left = make('left'), right = make('right');
  const artL = makeArt('left'), artR = makeArt('right');
  const sample = document.createElement('canvas');
  sample.width = SAMPLE_W; sample.height = SAMPLE_H;
  const sctx = sample.getContext('2d', { willReadFrequently: true });

  let blackRun = 0;
  let drm = false;

  const all = [left, right, artL, artR];
  function hide() { all.forEach((e) => (e.style.display = 'none')); }
  function place(els, bar, rightStart) {
    for (const e of els) {
      if (!e.isConnected) document.body.appendChild(e);
      e.style.width = bar + 'px';
      e.style.display = 'block';
    }
    els[1].style.left = rightStart + 'px';
  }

  function art() {
    try { return sessionStorage.getItem('__sofaArt'); } catch { return null; }
  }

  function frame() {
    const v = [...document.querySelectorAll('video')].find((x) => !x.paused && x.videoWidth && x.getBoundingClientRect().width > innerWidth * 0.6);
    const mode = window.__sofaAspectMode ? window.__sofaAspectMode() : 'contain';
    if (!v || mode !== 'contain' || innerWidth / innerHeight < 1.9) { blackRun = 0; return hide(); }
    // área real do vídeo na tela (object-fit: contain)
    const r = v.getBoundingClientRect();
    const shownW = Math.min(r.width, r.height * (v.videoWidth / v.videoHeight));
    const bar = r.left + (r.width - shownW) / 2;
    if (bar < 40) return hide();
    const rightStart = bar + shownW;

    if (!drm) {
      try {
        sctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
        const px = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        let max = 0;
        for (let i = 0; i < px.length; i += 16) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
        blackRun = max < 4 ? blackRun + 1 : 0;
        if (blackRun >= BLACK_FRAMES) drm = true;
      } catch {
        drm = true; // vídeo de outra origem: não dá para ler
      }
    }

    if (drm) {
      const a = art();
      left.style.display = right.style.display = 'none';
      if (!a) { artL.style.display = artR.style.display = 'none'; return; }
      const bg = `url("${a.replace(/"/g, '')}")`;
      if (artL.style.backgroundImage !== bg) artL.style.backgroundImage = artR.style.backgroundImage = bg;
      place([artL, artR], bar, rightStart);
      return;
    }
    artL.style.display = artR.style.display = 'none';
    place([left, right], bar, rightStart);
    // colunas da borda esquerda e direita do vídeo viram as laterais
    left.getContext('2d').drawImage(sample, 0, 0, 6, SAMPLE_H, 0, 0, 8, SAMPLE_H);
    right.getContext('2d').drawImage(sample, SAMPLE_W - 6, 0, 6, SAMPLE_H, 0, 0, 8, SAMPLE_H);
  }
  setInterval(frame, 1000 / FPS);
})();
