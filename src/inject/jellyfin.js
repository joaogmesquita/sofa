// Jellyfin: força o layout de TV (navegação por foco nativa) na primeira abertura.
(() => {
  try {
    if (localStorage.getItem('layout') !== 'tv') {
      localStorage.setItem('layout', 'tv');
      if (document.readyState !== 'loading') location.reload();
    }
  } catch {}
})();
