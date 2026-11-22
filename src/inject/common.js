// Carregado em todo serviço. O Sofá lê o controle direto no Windows, então
// escondemos a Gamepad API das páginas para o comando não chegar duplicado.
(() => {
  try {
    if (!window.__sofaNativeGamepad) {
      Object.defineProperty(Navigator.prototype, 'getGamepads', {
        value: () => [null, null, null, null],
        configurable: true
      });
    } else {
      // Jogos na nuvem: o Sofá entrega o DualSense como um controle padrão (via CDP).
      // Controles Xbox (XInput) continuam chegando direto pelo navegador.
      const orig = Navigator.prototype.getGamepads;
      let virt = null;
      const make = () => ({
        id: 'Sofa DualSense (STANDARD GAMEPAD Vendor: 054c)', index: 0, connected: true, mapping: 'standard',
        timestamp: performance.now(), axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null, hapticActuators: []
      });
      window.__sofaPad = (s) => {
        const first = !virt;
        if (first) virt = make();
        s.buttons.forEach((v, i) => { const bt = virt.buttons[i]; bt.value = v; bt.pressed = v > 0.12; bt.touched = v > 0; });
        virt.axes = s.axes;
        virt.timestamp = performance.now();
        if (first) { const e = new Event('gamepadconnected'); e.gamepad = virt; window.dispatchEvent(e); }
      };
      Object.defineProperty(Navigator.prototype, 'getGamepads', {
        value: function () {
          // o DualSense "de verdade" (se o navegador o enxergar) sai da lista para não duplicar
          const real = [...orig.call(this)].filter((g) => g && !/054c|dualsense|wireless controller/i.test(g.id));
          const out = [null, null, null, null];
          let i = 0;
          if (virt) out[i++] = virt;
          for (const g of real) if (i < 4) out[i++] = g;
          return out;
        },
        configurable: true
      });
    }
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
