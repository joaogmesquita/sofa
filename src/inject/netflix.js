// Ajustes da Netflix: cada título é um link dentro de .title-card; o perfil é um link também.
(() => {
  const api = window.__sofa;
  if (!api) return;
  api.extraSelector = '.profile-link, .title-card-container a, .slider-item a';
  // setas de paginação do carrossel atrapalham a navegação
  api.ignore = (el) => !!el.closest('.handle, .pagination-indicator');
})();
