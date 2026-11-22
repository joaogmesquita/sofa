// YouTube TV em monitor ultrawide: a interface é desenhada numa caixa 16:9 no
// centro da tela. Durante a reprodução em tela cheia, expandimos só o <video>
// para ocupar o monitor inteiro (vídeos 21:9 nativos preenchem a tela; nos 16:9
// o modo "Preencher" da proporção passa a funcionar). Os controles continuam no 16:9.
// Qualidade: o YouTube TV testa o navegador com parâmetros absurdos (width=99999,
// eotf=catavision...). O Edge diz "suportado" para tudo, então o YouTube não confia
// e trava em H.264 720p. Respondemos como uma TV (Cobalt): valida os parâmetros,
// aceita até 4K60 em VP9 (decodificado pela GPU) e recusa AV1 (sem decodificação
// por hardware na Vega 7, pesaria na CPU).
(() => {
  if (window.__sofaYtCaps) return;
  window.__sofaYtCaps = true;
  const MAX_W = 3840, MAX_H = 2160, MAX_FPS = 60;
  const ALLOWED = {
    eotf: ['bt709', 'smpte2084', 'arib-std-b67'],
    cryptoblockformat: ['subsample'],
    'decode-to-texture': ['true', 'false'],
    experimental: ['allowed'],
    tunnelmode: ['true', 'false']
  };
  const isAv1 = (t) => /av01/i.test(t);
  const orig = MediaSource.isTypeSupported.bind(MediaSource);
  MediaSource.isTypeSupported = (type) => {
    if (typeof type !== 'string') return orig(type);
    if (isAv1(type)) return false;
    const [base, ...params] = type.split(';').map((s) => s.trim());
    const kept = [base];
    for (const p of params) {
      const [k, rawV] = p.split('=');
      const key = (k || '').trim().toLowerCase();
      const v = (rawV || '').trim().replace(/"/g, '');
      if (key === 'codecs') { kept.push(p); continue; }
      if (key === 'width' && +v > MAX_W) return false;
      if (key === 'height' && +v > MAX_H) return false;
      if (key === 'framerate' && +v > MAX_FPS) return false;
      if (key === 'bitrate' && +v > 100000000) return false;
      if (ALLOWED[key] && !ALLOWED[key].includes(v.toLowerCase())) return false;
    }
    return orig(kept.join('; '));
  };
  if (navigator.mediaCapabilities) {
    const dec = navigator.mediaCapabilities.decodingInfo.bind(navigator.mediaCapabilities);
    navigator.mediaCapabilities.decodingInfo = (cfg) => {
      if (cfg && cfg.video && isAv1(cfg.video.contentType || '')) {
        return Promise.resolve({ supported: false, smooth: false, powerEfficient: false });
      }
      return dec(cfg);
    };
  }
})();

(() => {
  if (window.__sofaYtWide) return;
  window.__sofaYtWide = true;

  const st = document.createElement('style');
  st.textContent = `
    video.__sofa-wide {
      width: var(--sofa-w) !important; height: var(--sofa-h) !important;
      left: var(--sofa-l) !important; top: var(--sofa-t) !important;
    }
    .__sofa-ov { overflow: visible !important; }`;
  const attach = () => { if (!st.isConnected) (document.head || document.documentElement).appendChild(st); };

  let applied = null;

  function release() {
    if (!applied) return;
    applied.v.classList.remove('__sofa-wide');
    applied.ov.forEach((el) => el.classList.remove('__sofa-ov'));
    applied = null;
  }

  function expand(v) {
    release();
    const r = v.getBoundingClientRect();
    const sx = r.width / v.offsetWidth;
    const sy = r.height / v.offsetHeight;
    if (!isFinite(sx) || !isFinite(sy) || !sx || !sy) return;
    attach();
    v.style.setProperty('--sofa-w', innerWidth / sx + 'px');
    v.style.setProperty('--sofa-h', innerHeight / sy + 'px');
    v.style.setProperty('--sofa-l', v.offsetLeft - r.left / sx + 'px');
    v.style.setProperty('--sofa-t', v.offsetTop - r.top / sy + 'px');
    // ancestrais que cortariam o vídeo fora da caixa 16:9
    const ov = [];
    for (let el = v.parentElement; el && el !== document.body; el = el.parentElement) {
      if (getComputedStyle(el).overflow !== 'visible') { el.classList.add('__sofa-ov'); ov.push(el); }
    }
    v.classList.add('__sofa-wide');
    applied = { v, ov };
  }

  setInterval(() => {
    const ultrawide = innerWidth / innerHeight > 1.9;
    const v = document.querySelector('video.video-stream') || document.querySelector('video');
    const watching = ultrawide && v && location.hash.startsWith('#/watch') && v.offsetWidth >= 1000 && v.videoWidth > 0;
    if (!watching) return release();
    const r = v.getBoundingClientRect();
    const full = Math.abs(r.width - innerWidth) < 4 && Math.abs(r.height - innerHeight) < 4 && Math.abs(r.left) < 4;
    if (!applied || applied.v !== v || !full) expand(v);
  }, 500);
})();
