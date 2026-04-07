// ================================================================
// scraper.js — Browser-side scraper for Capacitor / Android / TV
// Replicates server-side scraping entirely in the browser.
// Uses fetch() directly (Capacitor native WebView bypasses CORS).
// ================================================================

window.SCRAPERS = {};

// ─── Remote Config Initialization ────────────────────────────────
const _initRemoteConfig = async () => {
  // Inicializamos todos como activos por defecto
  if (SCRAPERS.pelisplus) SCRAPERS.pelisplus.disabled = false;
  if (SCRAPERS.poseidon) SCRAPERS.poseidon.disabled = false;
  if (SCRAPERS.pelisplus_la) SCRAPERS.pelisplus_la.disabled = false;
  if (SCRAPERS.cuevana) SCRAPERS.cuevana.disabled = false;

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RemoteConfig) {
    try {
      const config = await window.Capacitor.Plugins.RemoteConfig.getBases();
      processConfig(config);
    } catch (err) {
      console.error("[PelisStream] Error al cargar Remote Config Nativo:", err);
    }
  } else {
    // Entorno Web/PC: Descargar desde el backend Node.js
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success && data.config) {
        processConfig(data.config);
      }
    } catch (err) {
      console.error("[PelisStream] Error al cargar Remote Config Web:", err);
    }
  }

  function processConfig(config) {
    // Solo procesamos si el config no está vacío (evita apagar todo si falla el internet)
    if (config && Object.keys(config).length > 0) {
      
      // PelisPlus
      if (config.pelisplus && config.pelisplus.length > 0) {
        PP_BASES = config.pelisplus;
        _ppBase = PP_BASES[0];
        SCRAPERS.pelisplus.disabled = false;
      } else {
        SCRAPERS.pelisplus.disabled = true;
      }

      // Poseidon
      if (config.poseidon && config.poseidon.length > 0) {
        POS_BASES = config.poseidon;
        _posBase = POS_BASES[0];
        SCRAPERS.poseidon.disabled = false;
      } else {
        SCRAPERS.poseidon.disabled = true;
      }

      // PelisPlus LA
      if (config.pelisplus_la && config.pelisplus_la.length > 0) {
        PPLA_BASE = config.pelisplus_la[0];
        SCRAPERS.pelisplus_la.disabled = false;
      } else {
        SCRAPERS.pelisplus_la.disabled = true;
      }

      // Cuevana
      if (config.cuevana && config.cuevana.length > 0) {
        CUEV_BASE = config.cuevana[0];
        SCRAPERS.cuevana.disabled = false;
      } else {
        SCRAPERS.cuevana.disabled = true;
      }

      console.log("[PelisStream] Remote Config procesada:", config);
      // Notificamos a la app que el config ha cambiado para ocultar botones
      window.dispatchEvent(new CustomEvent('configLoaded'));
    }
  }
};
_initRemoteConfig();


// ─── Shared utils ────────────────────────────────────────────────

// Sanitization: Strips dangerous characters to prevent XSS from source sites
function _sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\{}|^[\]]/g, '').trim();
}

// Local Cache: Stores results in localStorage for 30 minutes
async function _withCache(key, fetcher) {
  try {
    const cached = localStorage.getItem('ps_cache_' + key);
    if (cached) {
      const { data, expiry } = JSON.parse(cached);
      if (Date.now() < expiry) {
        console.log(`[PelisStream] Cache Hit: ${key}`);
        return data;
      }
    }
  } catch (e) {
    console.warn("[PelisStream] Cache read error:", e);
  }

  const data = await fetcher();
  if (data) {
    try {
      localStorage.setItem('ps_cache_' + key, JSON.stringify({
        data,
        expiry: Date.now() + (30 * 60 * 1000) // 30 minutes
      }));
    } catch (e) {
      console.warn("[PelisStream] Cache write error (possibly quota exceeded):", e);
    }
  }
  return data;
}

// Domain Whitelist for Scraping (Safety check for standalone mode)
const _ALLOWED_SCRAPE_DOMAINS = [
  'pelisplushd.bz', 'pelisplus.app', 'pelisplushd.net',
  'poseidonhd2.co', 'poseidonhd.co', 'pelisplushd.la',
  'cuevana3.to', 'cuevana3.com', 'cuevana', 'gist.githubusercontent.com'
];

function _isDomainAllowed(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return _ALLOWED_SCRAPE_DOMAINS.some(d => host.endsWith(d));
  } catch { return false; }
}

async function _fetch(url) {
  if (!_isDomainAllowed(url)) {
    console.error("[PelisStream] Scrape blocked: Domain not in whitelist", url);
    return null;
  }
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
function _doc(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function _qs(el, sel) { return el ? el.querySelector(sel) : null; }
function _qsa(el, sel) { return el ? Array.from(el.querySelectorAll(sel)) : []; }
function _text(el) { return el ? el.textContent.trim() : ''; }
function _attr(el, a) { return el ? (el.getAttribute(a) || '') : ''; }

function _fixImg(url, base) {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return base + url;
  return url;
}

// ─── Ad / video URL detection (shared) ───────────────────────────

function _isAd(url) {
  if (!url) return true;
  const bad = ['bannister', 'attirecider', 'adfly', 'shorte.st', 'ouo.io', 'linkvertise',
    'popcash', 'popads', 'adnxs', 'doubleclick', 'adserver', 'clickadu',
    'exosrv', 'juicyads', 'trafficjunky', 'propellerads', 'hilltopads'];
  const l = url.toLowerCase();
  if (bad.some(k => l.includes(k))) return true;
  if (/\?var=[a-z0-9]+$/i.test(url)) return true;
  return false;
}

function _isVideo(url) {
  if (!url) return false;
  const hosts = ['streamwish', 'filemoon', 'vidhide', 'voe', 'doodstream', 'dood', 'netu',
    'hqq', 'embed69', 'upstream', 'mixdrop', 'mp4upload', 'uqload', 'waaw',
    'peliscloud', 'streamsb', 'fembed', 'vidcloud', 'swiftload', 'hlscloud'];
  const l = url.toLowerCase();
  return hosts.some(h => l.includes(h));
}

function _srvName(url) {
  try {
    const host = new URL(url.startsWith('//') ? 'https:' + url : url).hostname;
    const name = host.replace('www.', '').replace('player.', '').split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { return 'Servidor'; }
}

// ─── Server extraction (iframes + script patterns + data attrs) ──

function _extractServers(doc, html, result) {
  // iframes
  for (const fr of _qsa(doc, 'iframe')) {
    const src = _attr(fr, 'src') || _attr(fr, 'data-src');
    if (src && _isVideo(src) && !_isAd(src)) {
      const eu = src.startsWith('//') ? 'https:' + src : src;
      if (!result.servers.find(s => s.embedUrl === eu))
        result.servers.push({ name: _srvName(eu), embedUrl: eu });
    }
  }
  // script/source patterns
  const hostPats = ['streamwish', 'filemoon', 'vidhide', 'voe[sx]?', 'dood(?:stream)?',
    'netu', 'hqq', 'embed69', 'upstream', 'mixdrop', 'mp4upload',
    'waaw', 'peliscloud'];
  for (const pat of hostPats) {
    const re = new RegExp(`https?:\\/\\/[^"'\\s<>]*${pat}\\.[^"'\\s<>]+`, 'gi');
    for (let m of (html.match(re) || [])) {
      m = m.replace(/["'\\;,)\]}>]+$/, '');
      if (!_isAd(m) && _isVideo(m) && !result.servers.find(s => s.embedUrl === m))
        result.servers.push({ name: _srvName(m), embedUrl: m });
    }
  }
  // data-* attributes
  for (const el of _qsa(doc, '[data-video],[data-embed],[data-player],[data-url]')) {
    for (const a of ['data-video', 'data-embed', 'data-player', 'data-url']) {
      const v = el.getAttribute(a);
      if (v && _isVideo(v) && !_isAd(v)) {
        const eu = v.startsWith('//') ? 'https:' + v : v;
        if (!result.servers.find(s => s.embedUrl === eu))
          result.servers.push({ name: _srvName(eu), embedUrl: eu });
      }
    }
  }
}

// ─── Season/episode extraction ────────────────────────────────────

function _extractSeasons(doc, result, base) {
  const map = new Map();

  // Find all episode links
  const links = _qsa(doc, 'a[href*="/episodio/"],a[href*="/capitulo/"],a[href*="episode-"],a[href*="episodio-"],a[href*="-1x"]');

  for (const a of links) {
    const h = _attr(a, 'href');
    if (!h) continue;
    const epUrl = h.startsWith('http') ? h : base + h;

    // Attempt to parse Season and Episode from URL
    let sn = -1, en = -1;

    // Format 1: 1x01 or 1x1
    let m = h.match(/-(\d+)[x×](\d+)/i) || h.match(/\/(\d+)[x×](\d+)/i);
    if (m) { sn = parseInt(m[1]); en = parseInt(m[2]); }
    else {
      // Format 2: temporada-1/episodio-2 or season-1/episode-2
      m = h.match(/(?:temporada|season)[/-]?(\d+).*(?:episodio|capitulo|episode)[/-]?(\d+)/i);
      if (m) { sn = parseInt(m[1]); en = parseInt(m[2]); }
      else {
        // Format 3: just episodio-5
        m = h.match(/(?:episodio|capitulo|episode)[/-]?(\d+)/i);
        if (m) en = parseInt(m[1]);
      }
    }

    // Attempt to parse from text if URL didn't have it
    const txt = _text(a) || _attr(a, 'title') || '';
    if (sn === -1 || en === -1) {
      let tm = txt.match(/(\d+)[x×](\d+)/i);
      if (tm) {
        if (sn === -1) sn = parseInt(tm[1]);
        if (en === -1) en = parseInt(tm[2]);
      } else {
        let tm2 = txt.match(/(?:Episodio|Capitulo|Episode)\s*(\d+)/i) || txt.match(/E\s*(\d+)/i);
        if (tm2 && en === -1) en = parseInt(tm2[1]);
      }
    }

    // Try to find Season from parent containers if still not found
    if (sn === -1) {
      let parent = a.closest('[data-season], [data-temporada], [id*="season"], [id*="temporada"], [class*="season"], [class*="temporada"], .se-c');
      if (parent) {
        let sAttr = parent.getAttribute('data-season') || parent.getAttribute('data-temporada');
        if (sAttr) {
          sn = parseInt(sAttr);
        } else {
          let pStr = (parent.id + ' ' + parent.className).match(/(?:season|temporada|se-c)[^\d]*(\d+)/i);
          if (pStr) sn = parseInt(pStr[1]);
          else {
            let pTitle = _text(_qs(parent, '.title, .se-title, h2, h3, h4'));
            let pTm = pTitle.match(/(?:Temporada|Season)\s*(\d+)/i);
            if (pTm) sn = parseInt(pTm[1]);
          }
        }
      }
    }

    // Fallbacks
    if (sn === -1) sn = 1;
    if (en === -1) en = map.get(sn) ? map.get(sn).length + 1 : 1;

    const arr = map.get(sn) || [];
    // Avoid exact duplicates by URL or Episode Number
    if (!arr.find(e => e.url === epUrl || e.number === en)) {
      arr.push({ number: en, title: txt || `Episodio ${en}`, url: epUrl });
      map.set(sn, arr);
    }
  }

  // Backup strategy if no links matched (e.g. flat li elements without hrefs containing "episodio")
  if (map.size === 0) {
    const listItems = _qsa(doc, 'li a');
    for (const a of listItems) {
      const h = _attr(a, 'href');
      if (!h) continue;
      const sm = h.match(/(\d+)[x×](\d+)/i);
      if (sm) {
        const sn = parseInt(sm[1]), en = parseInt(sm[2]);
        const epUrl = h.startsWith('http') ? h : base + h;
        const arr = map.get(sn) || [];
        if (!arr.find(e => e.url === epUrl || e.number === en)) {
          arr.push({ number: en, title: _text(a) || `Episodio ${en}`, url: epUrl });
          map.set(sn, arr);
        }
      }
    }
  }

  // Build final array
  result.seasons = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([n, eps]) => ({ number: n, episodes: eps.sort((a, b) => a.number - b.number) }));
}

// ═══════════════════════════════════════════════════════════════
// PelisPlus scraper
// ═══════════════════════════════════════════════════════════════

let PP_BASES = ['https://pelisplushd.bz', 'https://pelisplus.app', 'https://pelisplushd.net'];
let _ppBase = PP_BASES[0];

async function _ppFetch(url) {
  const targets = url.startsWith('http') ? [url] : PP_BASES.map(b => b + url);
  for (const t of targets) {
    try { const h = await _fetch(t); _ppBase = new URL(t).origin; return h; } catch (e) { /* try next */ }
  }
  return null;
}

function _ppMovies(doc) {
  const movies = [];
  for (const a of _qsa(doc, 'a[href*="/pelicula/"],a[href*="/serie/"],a[href*="/anime/"]')) {
    const href = _attr(a, 'href'); if (!href) continue;
    const full = href.startsWith('http') ? href : _ppBase + href;
    if (movies.find(m => m.url === full)) continue;
    const img = _qs(a, 'img');
    const image = _fixImg(_attr(img, 'data-src') || _attr(img, 'data-lazy-src') || _attr(img, 'src'), _ppBase);
    if (!img && !a.closest('article,.post,.card,.item,.Posters,.items')) continue;
    if (!image) continue;
    const titleEl = _qs(a, 'h2,h3,.Title,.title,.entry-title');
    let title = _sanitize(_text(titleEl) || _attr(a, 'title') || _attr(img, 'alt') || _text(a));
    let year = ''; const ym = title.match(/\((\d{4})\)/); if (ym) year = ym[1];
    if (!year) { const ys = _qs(a, '.Year,.year,span'); if (ys) { const y2 = _text(ys).match(/(\d{4})/); if (y2) year = y2[1]; } }
    let type = href.includes('/serie/') ? 'series' : href.includes('/anime/') ? 'anime' : 'movie';
    title = title.replace(/\s+/g, ' ').replace(/^VER\s+/i, '').replace(/\s+Online.*$/i, '').replace(/\s*-\s*Pelisplus.*$/i, '').replace(/\(?\d{4}\)?/, '').trim();
    if (title.length < 2 || title.length > 200) continue;
    movies.push({ title, year, rating: '', image, url: full, type, source: 'pelisplus' });
  }
  return movies;
}

SCRAPERS.pelisplus = {
  async getLatest(page = 1) { return _withCache(`pp_latest_${page}`, async () => { const h = await _ppFetch(page > 1 ? `${_ppBase}/peliculas?page=${page}` : `${_ppBase}/peliculas`); return h ? _ppMovies(_doc(h)) : []; }); },
  async getLatestSeries(page = 1) { return _withCache(`pp_latest_series_${page}`, async () => { const h = await _ppFetch(page > 1 ? `${_ppBase}/series?page=${page}` : `${_ppBase}/series`); return h ? _ppMovies(_doc(h)) : []; }); },

  async search(query) {
    return _withCache(`pp_search_${query}`, async () => {
      for (const u of [`${_ppBase}/search?s=${encodeURIComponent(query)}`, `${_ppBase}/?s=${encodeURIComponent(query)}`]) {
        const h = await _ppFetch(u); if (!h) continue;
        const r = _ppMovies(_doc(h)); if (r.length) return r;
      }
      return [];
    });
  },

  async getDetail(url) {
    return _withCache(`detail_${url}`, async () => {
      const html = await _ppFetch(url); if (!html) return null;
      const doc = _doc(html); const isSeries = url.includes('/serie/') || url.includes('/anime/');
      const res = { title: '', year: '', image: '', description: '', genres: [], servers: [], seasons: [], type: isSeries ? 'series' : 'movie', url, source: 'pelisplus' };
      res.title = _sanitize(_text(_qs(doc, 'h1')) || _text(_qs(doc, 'h2.Title,.Title h2')) || '');
      const ogI = _qs(doc, 'meta[property="og:image"]');
      res.image = _fixImg(ogI ? _attr(ogI, 'content') : (_attr(_qs(doc, 'img.TPostBg,.TPost img,.poster img,.sheader img'), 'data-src') || _attr(_qs(doc, 'img.TPostBg,.TPost img,.poster img'), 'src') || ''), _ppBase);
      res.description = _sanitize(_attr(_qs(doc, 'meta[property="og:description"]'), 'content') || _attr(_qs(doc, 'meta[name="description"]'), 'content') || '');
      for (const a of _qsa(doc, 'a[href*="/genero/"],a[href*="/generos/"]')) { const g = _text(a); if (g && g.length > 1 && g.length < 30 && !res.genres.includes(g)) res.genres.push(g); }
      res.genres = res.genres.slice(0, 6);
      const ym = res.title.match(/\((\d{4})\)/) || _text(_qs(doc, 'span.year,.Year')).match(/(\d{4})/); if (ym) res.year = ym[1];
      if (isSeries) _extractSeasons(doc, res, _ppBase); else _extractServers(doc, html, res);
      return res;
    });
  },

  async getEpisodeServers(url) {
    return _withCache(`ep_${url}`, async () => {
      const html = await _ppFetch(url); if (!html) return [];
      const tmp = { servers: [] }; _extractServers(_doc(html), html, tmp); return tmp.servers;
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// PoseidonHD scraper
// ═══════════════════════════════════════════════════════════════

let POS_BASES = ['https://www.poseidonhd2.co', 'https://poseidonhd2.co', 'https://www.poseidonhd.co'];
let _posBase = POS_BASES[0];

async function _posFetch(url) {
  const targets = url.startsWith('http') ? [url] : POS_BASES.map(b => b + url);
  for (const t of targets) {
    try { const h = await _fetch(t); _posBase = new URL(t).origin; return h; } catch (e) { }
  }
  return null;
}

function _posMovies(doc) {
  const movies = [];
  for (const sel of ['article', '.item', '.TPost', '.result-item', 'div[class*="post"]']) {
    for (const el of _qsa(doc, sel)) {
      const a = _qs(el, 'a[href*="/pelicula/"],a[href*="/serie/"]'); if (!a) continue;
      const href = _attr(a, 'href'); if (!href) continue;
      const full = href.startsWith('http') ? href : _posBase + href;
      if (movies.find(m => m.url === full)) continue;
      const img = _qs(el, 'img');
      const image = _fixImg(_attr(img, 'data-src') || _attr(img, 'data-lazy-src') || _attr(img, 'src'), _posBase);
      if (!image) continue;
      let title = _text(_qs(el, 'h2,h3,h4,.title,.Title')) || _attr(a, 'title') || _attr(img, 'alt') || '';
      title = title.replace(/\s+/g, ' ').replace(/\(\d{4}\)/, '').trim();
      if (title.length < 2 || title.length > 200) continue;
      let year = ''; const ym = _text(_qs(el, '.year,.Year,.extra span')).match(/(\d{4})/); if (ym) year = ym[1];
      movies.push({ title, year, rating: '', image, url: full, type: href.includes('/serie/') ? 'series' : 'movie', source: 'poseidon' });
    }
    if (movies.length > 0) break;
  }
  return movies;
}

SCRAPERS.poseidon = {
  async getLatest(page = 1) { return _withCache(`pos_latest_${page}`, async () => { const h = await _posFetch(page > 1 ? `/peliculas/page/${page}` : `/peliculas`); return h ? _posMovies(_doc(h)) : []; }); },
  async getLatestSeries(page = 1) { return _withCache(`pos_latest_series_${page}`, async () => { const h = await _posFetch(page > 1 ? `/series/page/${page}` : `/series`); return h ? _posMovies(_doc(h)) : []; }); },

  async search(query) {
    return _withCache(`pos_search_${query}`, async () => {
      for (const u of [`/?s=${encodeURIComponent(query)}`, `/search?s=${encodeURIComponent(query)}`]) {
        const h = await _posFetch(u); if (!h) continue;
        const r = _posMovies(_doc(h)); if (r.length) return r;
      }
      return [];
    });
  },

  async getDetail(url) {
    return _withCache(`detail_${url}`, async () => {
      const html = await _posFetch(url); if (!html) return null;
      const doc = _doc(html); const isSeries = url.includes('/serie/');
      const res = { title: '', year: '', image: '', description: '', genres: [], servers: [], seasons: [], type: isSeries ? 'series' : 'movie', url, source: 'poseidon' };
      res.title = _sanitize(_text(_qs(doc, 'h1')) || _text(_qs(doc, 'h2.Title,.Title h2')) || '');
      const ogI = _qs(doc, 'meta[property="og:image"]');
      res.image = _fixImg(ogI ? _attr(ogI, 'content') : (_attr(_qs(doc, '.poster img,.sheader img,.TPost img,article img'), 'data-src') || _attr(_qs(doc, '.poster img,.sheader img'), 'src') || ''), _posBase);
      res.description = _sanitize(_attr(_qs(doc, 'meta[property="og:description"]'), 'content') || _attr(_qs(doc, 'meta[name="description"]'), 'content') || '');
      for (const a of _qsa(doc, 'a[href*="/genero/"],a[href*="/generos/"]')) { const g = _text(a); if (g && g.length > 1 && g.length < 30 && !res.genres.includes(g)) res.genres.push(g); }
      res.genres = res.genres.slice(0, 6);
      const ym = res.title.match(/\((\d{4})\)/) || _text(_qs(doc, 'span.year,.Year,.extra span')).match(/(\d{4})/); if (ym) res.year = ym[1];
      // Poseidon player URL
      const ppat = /https?:\/\/player\.poseidonhd2?\.co\/[^"'\s<>]+/gi;
      for (let m of (html.match(ppat) || [])) { m = m.replace(/["'\\;,)\]}>]+$/, ''); if (!_isAd(m) && !res.servers.find(s => s.embedUrl === m)) res.servers.push({ name: m.includes('download') ? 'Descargar' : 'PoseidonPlayer', embedUrl: m }); }
      if (isSeries) _extractSeasons(doc, res, _posBase); else _extractServers(doc, html, res);
      return res;
    });
  },

  async getEpisodeServers(url) {
    return _withCache(`ep_${url}`, async () => {
      const html = await _posFetch(url); if (!html) return [];
      const tmp = { servers: [] }; _extractServers(_doc(html), html, tmp); return tmp.servers;
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// PelisPlus.la scraper
// ═══════════════════════════════════════════════════════════════
let PPLA_BASE = 'https://www.pelisplushd.la';
async function _pplaFetch(url) { try { return await _fetch(url.startsWith('http') ? url : PPLA_BASE + url); } catch { return null; } }

function _pplaMovies(doc) {
  const movies = [];
  for (const a of _qsa(doc, 'a[href*="/pelicula/"],a[href*="/serie/"],a[href*="/anime/"]')) {
    const href = _attr(a, 'href'); if (!href) continue;
    const full = href.startsWith('http') ? href : PPLA_BASE + href;
    if (movies.find(m => m.url === full)) continue;
    const parent = a.closest('article,.post,.card,.item,.items,.Posters');
    const img = _qs(a, 'img') || _qs(parent, 'img');
    const image = _fixImg(_attr(img, 'data-src') || _attr(img, 'src'), PPLA_BASE);
    if (!image) continue;
    let title = _text(_qs(a, 'h2,h3,.Title,.title,.entry-title')) || _attr(a, 'title') || _attr(img, 'alt') || _text(a);
    let year = ''; const ym = title.match(/\((\d{4})\)/); if (ym) year = ym[1];
    if (!year) { const ys = _qs(parent, '.Year,.year,span'); if (ys) { const y2 = _text(ys).match(/(\d{4})/); if (y2) year = y2[1]; } }
    let type = href.includes('/serie/') ? 'series' : href.includes('/anime/') ? 'anime' : 'movie';
    title = title.replace(/\s+/g, ' ').replace(/^VER\s+/i, '').replace(/\s+Online.*$/i, '').replace(/\s*-\s*Pelisplus.*$/i, '').replace(/\(?\d{4}\)?/, '').trim();
    if (title.length < 2 || title.length > 200) continue;
    movies.push({ title, year, rating: '', image, url: full, type, source: 'pelisplus_la' });
  }
  return movies;
}

SCRAPERS.pelisplus_la = {
  async getLatest(page = 1) { return _withCache(`ppla_latest_${page}`, async () => { const h = await _pplaFetch(page > 1 ? `/peliculas?page=${page}` : `/peliculas`); return h ? _pplaMovies(_doc(h)) : []; }); },
  async getLatestSeries(page = 1) { return _withCache(`ppla_latest_series_${page}`, async () => { const h = await _pplaFetch(page > 1 ? `/series?page=${page}` : `/series`); return h ? _pplaMovies(_doc(h)) : []; }); },
  async search(query) {
    return _withCache(`ppla_search_${query}`, async () => {
      let h = await _pplaFetch(`/buscar?q=${encodeURIComponent(query)}`);
      let m = h ? _pplaMovies(_doc(h)) : [];
      if(m.length) return m;
      h = await _pplaFetch(`/search?s=${encodeURIComponent(query)}`);
      return h ? _pplaMovies(_doc(h)) : [];
    });
  },
  async getDetail(url) {
    return _withCache(`detail_${url}`, async () => {
      const html = await _pplaFetch(url); if (!html) return null;
      const doc = _doc(html); const isSeries = url.includes('/serie/') || url.includes('/anime/');
      const res = { title: '', year: '', image: '', description: '', genres: [], servers: [], seasons: [], type: isSeries ? 'series' : 'movie', url, source: 'pelisplus_la' };
      res.title = _sanitize(_text(_qs(doc, 'h1')) || _text(_qs(doc, 'title')).split('|')[0].trim());
      const ogI = _qs(doc, 'meta[property="og:image"]');
      res.image = _fixImg(ogI ? _attr(ogI, 'content') : (_attr(_qs(doc, 'img.TPostBg,.poster img'), 'data-src') || _attr(_qs(doc, 'img.TPostBg,.poster img'), 'src')), PPLA_BASE);
      res.description = _sanitize(_attr(_qs(doc, 'meta[property="og:description"]'), 'content') || _text(_qs(doc, '.Description p,.sinopsis p')));
      for (const a of _qsa(doc, 'a[href*="/generos/"],a[href*="/genero/"]')) { const g = _text(a); if (g && !res.genres.includes(g)) res.genres.push(g); }
      res.genres = res.genres.slice(0, 6);
      const ym = res.title.match(/\((\d{4})\)/) || _text(_qs(doc, '.date,.year')).match(/(\d{4})/); if (ym) res.year = ym[1];
      if (isSeries) _extractSeasons(doc, res, PPLA_BASE); else _extractServers(doc, html, res);
      return res;
    });
  },
  async getEpisodeServers(url) {
    return _withCache(`ep_${url}`, async () => {
      const html = await _pplaFetch(url); if (!html) return [];
      const tmp = { servers: [] }; _extractServers(_doc(html), html, tmp); return tmp.servers;
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// Cuevana3 scraper
// ═══════════════════════════════════════════════════════════════
let CUEV_BASE = 'https://ww9.cuevana3.to';
async function _cuevFetch(url) { try { return await _fetch(url.startsWith('http') ? url : CUEV_BASE + url); } catch { return null; } }

function _cuevMovies(doc) {
  const movies = [];
  for (const a of _qsa(doc, 'a[href*="/pelicula/"],a[href*="/serie/"],a.TPost,a.item')) {
    const href = _attr(a, 'href'); if (!href) continue;
    if (!href.includes('/pelicula/') && !href.includes('/serie/') && !href.match(/\/\d+\/[\w-]+/)) continue;
    const full = href.startsWith('http') ? href : CUEV_BASE + href;
    if (movies.find(m => m.url === full)) continue;
    const parent = a.closest('li,article,.TPost,.item,.post');
    const img = _qs(a, 'img') || _qs(parent, 'img');
    const image = _fixImg(_attr(img, 'data-src') || _attr(img, 'src'), CUEV_BASE);
    if (!image) continue;
    let title = _text(_qs(a, 'h2,h3,.Title,.title')) || _attr(a, 'title') || _attr(img, 'alt') || _text(a);
    let year = ''; const ym = title.match(/\((\d{4})\)/); if (ym) year = ym[1];
    if (!year) { const ys = _qs(parent, '.Year,.year,span'); if (ys) { const y2 = _text(ys).match(/(\d{4})/); if (y2) year = y2[1]; } }
    title = title.replace(/\s+/g, ' ').replace(/^Cuevana 3\s*/i, '').replace(/\(?\d{4}\)?/, '').trim();
    if (title.length < 2 || title.length > 200) continue;
    movies.push({ title, year, rating: '', image, url: full, type: full.includes('/serie/') ? 'series' : 'movie', source: 'cuevana' });
  }
  return movies;
}

SCRAPERS.cuevana = {
  async getLatest(page = 1) { return _withCache(`cuev_latest_${page}`, async () => { const h = await _cuevFetch(page > 1 ? `/peliculas/page/${page}` : `/peliculas`); return h ? _cuevMovies(_doc(h)) : []; }); },
  async getLatestSeries(page = 1) { return _withCache(`cuev_latest_series_${page}`, async () => { const h = await _cuevFetch(page > 1 ? `/serie/page/${page}` : `/serie`); return h ? _cuevMovies(_doc(h)) : []; }); },
  async search(query) { return _withCache(`cuev_search_${query}`, async () => { const h = await _cuevFetch(`/?s=${encodeURIComponent(query)}`); return h ? _cuevMovies(_doc(h)) : []; }); },
  async getDetail(url) {
    return _withCache(`detail_${url}`, async () => {
      const html = await _cuevFetch(url); if (!html) return null;
      const doc = _doc(html); const isSeries = url.includes('/serie/');
      const res = { title: '', year: '', image: '', description: '', genres: [], servers: [], seasons: [], type: isSeries ? 'series' : 'movie', url, source: 'cuevana' };
      res.title = _sanitize(_text(_qs(doc, 'h1')) || _text(_qs(doc, 'title')).split('|')[0].replace('Cuevana', '').trim());
      const ogI = _qs(doc, 'meta[property="og:image"]');
      res.image = _fixImg(ogI ? _attr(ogI, 'content') : (_attr(_qs(doc, '.TPostBg,.poster img,.Image img'), 'data-src') || _attr(_qs(doc, '.TPostBg,.poster img,.Image img'), 'src')), CUEV_BASE);
      res.description = _sanitize(_attr(_qs(doc, 'meta[property="og:description"]'), 'content') || _text(_qs(doc, '.Description p,.sinopsis p')));
      for (const a of _qsa(doc, 'a[href*="/category/"],a[href*="/genero/"]')) { const g = _text(a); if (g && !res.genres.includes(g)) res.genres.push(g); }
      res.genres = res.genres.slice(0, 6);
      const ym = res.title.match(/\((\d{4})\)/) || _text(_qs(doc, '.date,.year,.Year')).match(/(\d{4})/); if (ym) res.year = ym[1];
      if (isSeries) {
          _extractSeasons(doc, res, CUEV_BASE);
      } else {
          _extractServers(doc, html, res);
          for(const ifr of _qsa(doc, '.TPlayerTb iframe, .TPlayer iframe')) {
              let src = _attr(ifr, 'src') || _attr(ifr, 'data-src');
              if(src) {
                  if(src.startsWith('//')) src = 'https:' + src;
                  if(!res.servers.find(s=>s.embedUrl===src)) res.servers.push({name:'CuevanaPlayer', embedUrl:src});
              }
          }
      }
      return res;
    });
  },
  async getEpisodeServers(url) {
    return _withCache(`ep_${url}`, async () => {
      const html = await _cuevFetch(url); if (!html) return [];
      const doc = _doc(html); const tmp = { servers: [] }; _extractServers(doc, html, tmp);
      for(const ifr of _qsa(doc, '.TPlayerTb iframe, .TPlayer iframe')) {
          let src = _attr(ifr, 'src') || _attr(ifr, 'data-src');
          if(src) {
              if(src.startsWith('//')) src = 'https:' + src;
              if(!tmp.servers.find(s=>s.embedUrl===src)) tmp.servers.push({name:'CuevanaPlayer', embedUrl:src});
          }
      }
      return tmp.servers;
    });
  }
};
