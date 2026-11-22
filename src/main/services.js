// Catálogo de serviços. Cada um abre no Edge (por causa do DRM) e é controlado via CDP.
//   mode: 'keys'    -> o site já navega por setas (interfaces de TV); repassamos teclas
//         'spatial' -> injetamos navegação espacial (inject/spatial-nav.js)
//   back: 'escape' | 'history' | 'spatial'
//   inject: scripts extras de src/inject a carregar em toda página

const TV_UA =
  'Mozilla/5.0 (Linux armeabi-v7a; Android 9) Cobalt/23.lts.4.308474-gold (unlike Gecko) v8/8.8.278.8-jit gles Starboard/14, Google_ATV_sabrina_2020/RVC (google, Chromecast, Wireless) com.google.android.youtube.tv/2.12.08';

module.exports = [
  {
    id: 'youtube',
    site: 'https://www.youtube.com/',
    name: 'YouTube',
    hint: 'Interface de TV, pareia com o app do celular',
    url: 'https://www.youtube.com/tv',
    color: '#ff0033',
    mode: 'keys',
    back: 'escape',
    ua: TV_UA,
    keys: { playpause: 'Enter' },
    inject: ['youtube.js', 'ambient.js']
  },
  {
    id: 'netflix',
    site: 'https://www.netflix.com/br/',
    name: 'Netflix',
    hint: 'Navegação por controle',
    url: 'https://www.netflix.com/browse',
    color: '#e50914',
    mode: 'spatial',
    back: 'spatial',
    keys: { playpause: ' ' },
    inject: ['netflix.js', 'ambient.js']
  },
  {
    id: 'prime',
    site: 'https://www.primevideo.com/',
    name: 'Prime Video',
    hint: 'Navegação por controle',
    url: 'https://www.primevideo.com',
    color: '#1a98ff',
    mode: 'spatial',
    back: 'spatial',
    keys: { playpause: ' ' },
    inject: ['ambient.js']
  },
  {
    id: 'disney',
    site: 'https://www.disneyplus.com/pt-br',
    name: 'Disney+',
    hint: 'Navegação por controle',
    url: 'https://www.disneyplus.com',
    color: '#113ccf',
    mode: 'spatial',
    back: 'spatial',
    keys: { playpause: ' ' },
    inject: ['ambient.js']
  },
  {
    id: 'xcloud',
    site: 'https://www.xbox.com/pt-BR/play',
    name: 'Xbox Cloud Gaming',
    hint: 'Jogos na nuvem com Game Pass · segure PS/Xbox para voltar',
    url: 'https://www.xbox.com/pt-BR/play',
    color: '#107c10',
    mode: 'keys',
    gamepad: 'native', // o controle vai direto para o jogo
    back: 'escape',
    keys: { playpause: ' ' },
    inject: []
  },
  {
    id: 'jellyfin',
    site: 'http://localhost:8096/web/index.html',
    name: 'Jellyfin',
    hint: 'Filmes e séries do PC',
    url: 'http://localhost:8096/web/index.html',
    color: '#aa5cc3',
    mode: 'keys',
    back: 'history',
    keys: { playpause: ' ' },
    inject: ['jellyfin.js', 'ambient.js']
  }
];
