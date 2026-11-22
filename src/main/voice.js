// Voz: sobe o servidor Whisper (Python, openai-whisper já instalado) e
// transforma frases em português em ações do Sofá.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 8790;
const SERVER = path.join(__dirname, '..', 'voice', 'whisper_server.py');

const SERVICES = [
  { id: 'youtube', name: 'YouTube', words: ['youtube', 'you tube', 'iutubi', 'yutube'] },
  { id: 'netflix', name: 'Netflix', words: ['netflix', 'netflics', 'net flix', 'netflis'] },
  { id: 'prime', name: 'Prime Video', words: ['prime video', 'amazon prime', 'prime', 'amazon'] },
  { id: 'disney', name: 'Disney+', words: ['disney plus', 'disney mais', 'disney+', 'disney', 'disnei'] },
  { id: 'jellyfin', name: 'Jellyfin', words: ['jellyfin', 'jelly fin', 'meus filmes', 'minha biblioteca'] }
];

const enc = encodeURIComponent;
const SEARCH = {
  youtube: (q) => `https://www.youtube.com/tv#/search?q=${enc(q)}`,
  netflix: (q) => `https://www.netflix.com/search?q=${enc(q)}`,
  prime: (q) => `https://www.primevideo.com/search/?phrase=${enc(q)}`,
  disney: (q) => `https://www.disneyplus.com/search?q=${enc(q)}`,
  jellyfin: (q) => `http://localhost:8096/web/index.html#/search.html?query=${enc(q)}`
};

const OPEN_VERBS = /\b(abrir|abre|abra|iniciar|inicia|inicie|ir para|vai para|va para|entrar no|entra no|entrar na|entra na|ligar|liga|coloca|colocar|bota|botar|quero ver|quero assistir)\b/g;
const SEARCH_VERBS = /\b(procurar|procura|procure|buscar|busca|busque|pesquisar|pesquisa|pesquise|achar|acha|encontrar|encontra|assistir|assiste|ver|tocar|toca|toque|reproduzir|passar|passa)\b/g;
const FILLER = new Set(['e', 'no', 'na', 'nos', 'nas', 'do', 'da', 'o', 'a', 'os', 'as', 'em', 'um', 'uma', 'ai', 'pra', 'para', 'me', 'de', 'sofa', 'favor', 'por', 'mim']);

// tira palavras de ligação só das pontas ("receita de bolo" mantém o "de")
function trimFiller(s) {
  const w = s.split(' ').filter(Boolean);
  while (w.length && FILLER.has(w[0])) w.shift();
  while (w.length && FILLER.has(w[w.length - 1])) w.pop();
  return w.join(' ');
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const repeat = (action, n) => Array.from({ length: n }, () => action);

// Retorna { label, actions } ou null
function parse(text, activeId) {
  const t = normalize(text);
  if (!t) return null;

  const simple = [
    [/^(pausa|pausar|pause|parar|para|continuar|continua|play|da play|de play|dar play|tocar|toca|despausar|retomar)$/, 'Play/pausa', [{ type: 'playpause' }]],
    [/^(voltar|volta|volte|retornar)$/, 'Voltar', [{ type: 'back' }]],
    [/\b(tela inicial|inicio|menu principal|home|fechar|fecha|sair do app|sair)\b/, 'Início', [{ type: 'home' }]],
    [/\b(aumenta|aumentar|aumente|sobe|subir|suba|mais alto)\b.*\b(volume|som)?/, 'Volume +', repeat({ type: 'volume', dir: 'volup' }, 5)],
    [/\b(diminui|diminuir|diminua|abaixa|abaixar|abaixe|baixa|baixar|mais baixo)\b/, 'Volume −', repeat({ type: 'volume', dir: 'voldown' }, 5)],
    [/\b(preencher|preenche|proporcao|ultrawide|ultra wide|tela toda|esticar|estica|zoom)\b/, 'Proporção', [{ type: 'aspect' }]],
    [/\b(mudo|silencia|silenciar|tira o som|sem som|volta o som)\b/, 'Mudo', [{ type: 'volume', dir: 'mute' }]],
    [/\b(avanca|avancar|avance|adianta|adiantar|adiante|pula|pular|pule)\b/, 'Avançar', repeat({ type: 'seek', dir: 'fwd' }, 3)],
    [/\b(retrocede|retroceder|volta um pouco|voltar um pouco|rebobina|rebobinar)\b/, 'Retroceder', repeat({ type: 'seek', dir: 'back' }, 3)]
  ];

  const service = SERVICES.find((s) => s.words.some((w) => new RegExp(`\\b${w.replace('+', '\\+')}`).test(t)));
  if (!service) {
    for (const [re, label, actions] of simple) if (re.test(t)) return { label, actions };
  }

  let rest = t;
  if (service) for (const w of service.words) rest = rest.replace(new RegExp(`\\b${w.replace('+', '\\+')}\\b`, 'g'), ' ');
  const wantsSearch = new RegExp(SEARCH_VERBS.source).test(rest);
  rest = trimFiller(rest.replace(/\+/g, ' ').replace(OPEN_VERBS, ' ').replace(SEARCH_VERBS, ' ').replace(/\s+/g, ' ').trim());

  if (service && !rest) return { label: `Abrindo ${service.name}`, actions: [{ type: 'launch', id: service.id }] };

  // busca: no serviço citado, senão no app aberto, senão no YouTube
  const target = service || SERVICES.find((s) => s.id === activeId) || SERVICES[0];
  const query = rest || t;
  if (!service && !wantsSearch && !activeId && query.split(' ').length < 2) return null;
  return {
    label: `Buscando “${query}” no ${target.name}`,
    actions: [{ type: 'launch', id: target.id, url: SEARCH[target.id](query) }]
  };
}

class Voice {
  constructor() {
    this.ready = false;
    this.proc = null;
  }

  start() {
    const python = process.env.SOFA_PYTHON || 'python';
    this.proc = spawn(python, [SERVER], {
      env: { ...process.env, SOFA_WHISPER_PORT: String(PORT), PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    this.proc.stdout.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(s);
      if (s.includes('carregado')) this.ready = true;
    });
    this.proc.stderr.on('data', (d) => {
      const s = d.toString();
      if (!/warning/i.test(s)) process.stderr.write('[whisper] ' + s);
    });
    this.proc.on('exit', (code) => {
      this.ready = false;
      console.warn('[voice] servidor Whisper saiu, código', code);
    });
  }

  stop() {
    this.proc?.kill();
  }

  transcribe(wav) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: PORT, path: '/transcribe', method: 'POST', headers: { 'Content-Type': 'audio/wav', 'Content-Length': wav.length }, timeout: 30000 },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(body);
              j.error ? reject(new Error(j.error)) : resolve(j.text || '');
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
      req.end(wav);
    });
  }
}

module.exports = { Voice, parse, normalize };
