// "Continuar assistindo": guarda o que foi assistido (título, imagem, progresso) por serviço.
const fs = require('fs');
const path = require('path');
const https = require('https');

const MAX = 14;
const MIN_WATCH_S = 45; // só conta como assistido depois disso

// Lido dentro da página do serviço via CDP
const SNAPSHOT = `(() => {
  const v = [...document.querySelectorAll('video')].find((x) => x.duration > 0 && x.currentTime > 0);
  if (!v) return null;
  const o = { url: location.href, title: document.title, time: v.currentTime, duration: isFinite(v.duration) ? v.duration : 0 };
  const yt = location.href.match(/[?&]v=([\\w-]{11})/);
  if (yt) o.videoId = yt[1];
  const og = document.querySelector('meta[property="og:image"]');
  if (og && og.content) o.image = og.content;
  const t = document.querySelector('[data-uia="video-title"] h4, [data-uia="video-title"], .atvwebplayersdk-title-text, [data-testid="title-field"], .title-field, .videoOsdTitle, .osdTitle');
  if (t && t.textContent.trim()) o.title = t.textContent.trim().replace(/\\s+/g, ' ').slice(0, 90);
  const ep = document.querySelector('.atvwebplayersdk-subtitle-text, [data-uia="video-title"] span, [data-testid="subtitle-field"], .videoOsdSecondaryText');
  if (ep && ep.textContent.trim()) o.subtitle = ep.textContent.trim().replace(/\\s+/g, ' ').slice(0, 90);
  return o;
})()`;

function getJson(url) {
  return new Promise((resolve) => {
    https
      .get(url, { timeout: 4000 }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
      })
      .on('error', () => resolve(null))
      .on('timeout', function () { this.destroy(); resolve(null); });
  });
}

class Recents {
  constructor(dir) {
    this.file = path.join(dir, 'recents.json');
    this.titles = {};
    try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.items = []; }
  }

  list() {
    return this.items;
  }

  save() {
    try { fs.writeFileSync(this.file, JSON.stringify(this.items, null, 1)); } catch {}
  }

  remove(key) {
    this.items = this.items.filter((i) => i.key !== key);
    this.save();
  }

  // devolve true se mudou algo
  async record(service, snap) {
    if (!snap || snap.time < MIN_WATCH_S) return false;
    const item = { service: service.id, serviceName: service.name, color: service.color, at: Date.now(), time: Math.round(snap.time), duration: Math.round(snap.duration || 0) };
    if (service.id === 'youtube' && snap.videoId) {
      item.key = 'yt:' + snap.videoId;
      item.url = `https://www.youtube.com/tv#/watch?v=${snap.videoId}&t=${item.time}s`;
      item.image = `https://i.ytimg.com/vi/${snap.videoId}/hqdefault.jpg`;
      // o YouTube TV não expõe o título na página; o oEmbed público devolve
      if (!this.titles[snap.videoId]) {
        const j = await getJson(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${snap.videoId}`);
        if (j) this.titles[snap.videoId] = { title: j.title, subtitle: j.author_name };
      }
      Object.assign(item, this.titles[snap.videoId] || { title: 'Vídeo do YouTube' });
    } else {
      const cleanUrl = snap.url.split('#')[0];
      item.key = service.id + ':' + cleanUrl.replace(/[?&]trackId=.*$/, '');
      item.url = cleanUrl;
      item.title = snap.title && !/^(netflix|prime video|disney\+?|jellyfin)$/i.test(snap.title.trim()) ? snap.title : service.name;
      item.subtitle = snap.subtitle;
      item.image = snap.image;
    }
    // terminou (>= 95%)? sai da lista
    if (item.duration && item.time / item.duration > 0.95) {
      const had = this.items.some((i) => i.key === item.key);
      this.remove(item.key);
      return had;
    }
    this.items = [item, ...this.items.filter((i) => i.key !== item.key)].slice(0, MAX);
    this.save();
    return true;
  }
}

module.exports = { Recents, SNAPSHOT };
