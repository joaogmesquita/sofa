// Carregado em todo serviço. O Sofá lê o controle direto no Windows, então
// escondemos a Gamepad API das páginas para o comando não chegar duplicado.
(() => {
  try {
    if (!window.__sofaNativeGamepad) Object.defineProperty(Navigator.prototype, 'getGamepads', {
      value: () => [null, null, null, null],
      configurable: true
    });
  } catch {}
  // Proporção do vídeo para telas ultrawide (21:9):
  //   Original  -> 16:9 inteiro (com modo ambiente nas laterais onde o DRM permite)
  //   Zoom suave -> amplia ~16%: metade das faixas laterais, corta ~8% em cima/embaixo
  //   Preencher -> ocupa a largura toda (corta as faixas de filmes 2.39:1)
  //   Esticar   -> distorce para preencher
  try {
    const MODES = [['contain', 'Original'], ['zoom', 'Zoom suave'], ['cover', 'Preencher ultrawide'], ['fill', 'Esticar']];
    const CSS = {
      contain: '',
      zoom: 'video { object-fit: contain !important; transform: scale(1.16) !important; transform-origin: 50% 50% !important; }',
      cover: 'video { object-fit: cover !important; }',
      fill: 'video { object-fit: fill !important; }'
    };
    const KEY = '__sofaAspect';
    const st = document.createElement('style');
    const read = () => { try { const m = localStorage.getItem(KEY); return CSS[m] !== undefined ? m : 'contain'; } catch { return 'contain'; } };
    window.__sofaAspectMode = read;
    const apply = (m) => {
      st.textContent = CSS[m];
      if (!st.isConnected) (document.head || document.documentElement).appendChild(st);
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => apply(read())) : apply(read());
    window.__sofaAspect = () => {
      const i = (MODES.findIndex(([m]) => m === read()) + 1) % MODES.length;
      try { localStorage.setItem(KEY, MODES[i][0]); } catch {}
      apply(MODES[i][0]);
      return MODES[i][1];
    };
  } catch {}

  // esconde o cursor parado (estilo TV); volta ao mexer o mouse
  try {
    let t;
    const style = document.createElement('style');
    style.textContent = 'html.__sofa-nocursor, html.__sofa-nocursor * { cursor: none !important; }';
    const add = () => (document.head || document.documentElement).appendChild(style);
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
    window.addEventListener('mousemove', () => {
      document.documentElement.classList.remove('__sofa-nocursor');
      clearTimeout(t);
      t = setTimeout(() => document.documentElement.classList.add('__sofa-nocursor'), 2500);
    }, true);
  } catch {}
})();
