// Ícones oficiais dos serviços, baixados do próprio site (apple-touch-icon / manifest)
// e guardados só no PC do usuário. Nada de logo de marca vai no repositório.
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_AGE = 30 * 24 * 3600 * 1000;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

async function fetchWithTimeout(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, redirect: 'follow', signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1];
const sizeOf = (s) => Math.max(0, ...String(s || '').split(/\s+/).map((x) => parseInt(x, 10) || 0));

async function candidates(site) {
  const res = await fetchWithTimeout(site);
  const html = await res.text();
  const base = res.url || site;
  const out = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    const url = new URL(href, base).href;
    if (rel === 'manifest') {
      try {
        const m = await (await fetchWithTimeout(url)).json();
        for (const ic of m.icons || []) {
          if (/monochrome/.test(ic.purpose || '')) continue;
          out.push({ url: new URL(ic.src, url).href, size: sizeOf(ic.sizes) || 192 });
        }
      } catch {}
    } else if (rel.includes('apple-touch-icon')) {
      out.push({ url, size: sizeOf(attr(tag, 'sizes')) || 180 });
    } else if (/(^|\s)icon(\s|$)/.test(rel) && !rel.includes('mask')) {
      out.push({ url, size: sizeOf(attr(tag, 'sizes')) || (/\.ico(\?|$)/i.test(url) ? 32 : 64) });
    }
  }
  return out.sort((a, b) => b.size - a.size);
}

class Icons {
  constructor(dir) {
    this.dir = path.join(dir, 'icons');
    fs.mkdirSync(this.dir, { recursive: true });
    this.indexFile = path.join(this.dir, 'index.json');
    try { this.index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8')); } catch { this.index = {}; }
  }

  // data: URL do ícone guardado, ou null
  get(id) {
    const e = this.index[id];
    if (!e) return null;
    try {
      const b = fs.readFileSync(path.join(this.dir, e.file));
      return `data:${e.type};base64,${b.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async fetchOne(service) {
    const list = await candidates(service.site);
    for (const c of list) {
      try {
        const res = await fetchWithTimeout(c.url);
        if (!res.ok) continue;
        const type = (res.headers.get('content-type') || '').split(';')[0].trim();
        const ext = TYPES[type];
        if (!ext || ext === 'ico') continue; // .ico fica pequeno e borrado
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500) continue;
        const file = `${service.id}.${ext}`;
        fs.writeFileSync(path.join(this.dir, file), buf);
        this.index[service.id] = { file, type, size: c.size, from: c.url, at: Date.now() };
        fs.writeFileSync(this.indexFile, JSON.stringify(this.index, null, 1));
        return true;
      } catch {}
    }
    return false;
  }

  // baixa o que falta ou está velho; devolve true se algo mudou
  async refresh(services) {
    let changed = false;
    await Promise.all(services.filter((s) => s.site).map(async (s) => {
      const e = this.index[s.id];
      if (e && Date.now() - e.at < MAX_AGE && fs.existsSync(path.join(this.dir, e.file))) return;
      try {
        if (await this.fetchOne(s)) changed = true;
      } catch (err) {
        console.warn('[icons]', s.id, err.message);
      }
    }));
    return changed;
  }
}

module.exports = Icons;
