const express = require('express');
const os = require('os');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const pelisplus = require('./scrapers/pelisplus');
const poseidon = require('./scrapers/poseidon');
const pelisplus_la = require('./scrapers/pelisplus_la');
const cuevana = require('./scrapers/cuevana');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======================== INPUT SANITIZATION ========================
// Strips characters that are dangerous in URL/query contexts and enforces length limits.

const ALLOWED_SOURCES = new Set(['pelisplus', 'poseidon', 'pelisplus_la', 'cuevana', 'all']);
const ALLOWED_TYPES   = new Set(['movies', 'series', 'all']);

/**
 * Sanitizes a free-text search query.
 * - Trims whitespace
 * - Limits to 200 characters to prevent DoS
 * - Strips characters that have no business being in a movie title
 */
function sanitizeQuery(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 200).replace(/[<>"'`;\\{}|^[\]]/g, '');
}

/**
 * Validates and sanitizes a source parameter against the allowlist.
 */
function sanitizeSource(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ALLOWED_SOURCES.has(s) ? s : 'all';
}

/**
 * Validates a type parameter against the allowlist.
 */
function sanitizeType(raw) {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ALLOWED_TYPES.has(t) ? t : 'all';
}

/**
 * Validates that a URL belongs to one of the whitelisted scraping domains.
 * Prevents SSRF attacks via the /api/detail and /api/episodes endpoints.
 */
function sanitizeContentUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const parsed = new URL(raw.trim());
    const hostname = parsed.hostname.replace(/^www\./, '');
    const allowed = SCRAPER_ALLOWED_HOSTS.some(h => hostname.endsWith(h));
    if (!allowed) return '';
    return parsed.href; // Return normalized URL
  } catch {
    return '';
  }
}

// Whitelisted hostnames for content scraping (detail/episodes endpoints)
const SCRAPER_ALLOWED_HOSTS = [
  'pelisplushd.bz', 'pelisplus.app', 'pelisplushd.net',
  'poseidonhd2.co', 'poseidonhd.co',
  'pelisplushd.la',
  'cuevana3.to', 'cuevana3.com', 'cuevana3.biz',
];

// ======================== PROXY SETTINGS ========================
const PROXY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

// Allowed external hosts for the proxy (whitelist)
const PROXY_ALLOWED_HOSTS = [
  'pelisplushd.bz', 'poseidonhd2.co', 'poseidonhd.co',
  'pelisplushd.la', 'cuevana3.to',
  'streamwish.com', 'filemoon.sx', 'vidhide.com', 'voe.sx',
  'doodstream.com', 'dood.la', 'netu.ac', 'hqq.tv',
  'embed69.org', 'upstream.to', 'mixdrop.ag', 'mp4upload.com',
  'uqload.com', 'waaw.tv', 'peliscloud.com', 'streamsb.net',
  'fembed.com', 'mycloud.vip', 'vidcloud.ru', 'swiftload.io',
];

function isHostAllowed(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return PROXY_ALLOWED_HOSTS.some(h => hostname.endsWith(h));
  } catch {
    return false;
  }
}

// ======================== RATE LIMITING ========================

/**
 * General API rate limiter — 60 requests per minute per IP.
 * Applied to all /api/* routes to prevent scraping of our own endpoints.
 */
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 60,               // 60 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas peticiones. Intenta en un minuto.' },
});

/**
 * Proxy-specific rate limiter — 30 requests per minute per IP.
 * More restrictive because proxy requests are heavier and hit external servers.
 */
const proxyRateLimit = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 30,               // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many proxy requests. Try again in a minute.',
});

// Apply general rate limiter to all /api/* routes
app.use('/api/', apiRateLimit);

// ======================== IN-MEMORY CACHE ========================

// Cache entries: { data, expiresAt }
const cache = new Map();

const CACHE_TTL = {
  HOME:    30 * 60 * 1000, // 30 minutes — content lists change slowly
  SEARCH:  30 * 60 * 1000, // 30 minutes
  DETAIL:  60 * 60 * 1000, // 60 minutes — detail pages change even less
  EPISODE: 60 * 60 * 1000, // 60 minutes
};

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = CACHE_TTL.HOME) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// Cache cleanup is started by the server (see require.main block below).
function startCacheCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiresAt) cache.delete(key);
    }
  }, 10 * 60 * 1000);
}

// ======================== REMOTE CONFIG ========================
const REMOTE_CONFIG_URL = 'https://gist.githubusercontent.com/System32GG/451f98f13899c2c77b0948e5bc28f9f2/raw/config.json';
let currentRemoteConfig = null;

async function syncRemoteConfig() {
  try {
    const res = await axios.get(REMOTE_CONFIG_URL, { timeout: 10000 });
    const config = res.data;
    if (config && Object.keys(config).length > 0) {
      currentRemoteConfig = config;
      if (config.pelisplus && config.pelisplus.length) pelisplus.setBaseUrl(config.pelisplus[0]);
      if (config.poseidon && config.poseidon.length) poseidon.setBaseUrl(config.poseidon[0]);
      if (config.pelisplus_la && config.pelisplus_la.length) pelisplus_la.setBaseUrl(config.pelisplus_la[0]);
      if (config.cuevana && config.cuevana.length) cuevana.setBaseUrl(config.cuevana[0]);
      console.log('[Server] Remote Config sincronizada.');
    }
  } catch (e) {
    console.error('[Server] Error sincronizando Remote Config:', e.message);
  }
}
// syncRemoteConfig() is called inside the require.main block below.

// ======================== API ROUTES ========================

// Remote Config Endpoint
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: currentRemoteConfig });
});

// Manual cache clear endpoint (useful during development and debugging)
app.delete('/api/cache', (req, res) => {
  const size = cache.size;
  cache.clear();
  console.log(`[Server] Cache cleared manually (${size} entries removed).`);
  res.json({ success: true, cleared: size });
});

// ======================== UMAMI PROXY ========================
// Sirve el script de Umami y reenvía los eventos desde el propio dominio,
// evitando que bloqueadores como Brave Shields lo detecten como tracker externo.

app.get('/js/main.js', async (req, res) => {
  try {
    const r = await axios.get('https://cloud.umami.is/script.js', { timeout: 10000 });
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(r.data);
  } catch (e) {
    console.error('[Umami] Error al obtener script:', e.message);
    res.status(502).send('');
  }
});

app.post('/js/collect', async (req, res) => {
  try {
    const r = await axios.post('https://cloud.umami.is/api/send', req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    res.json(r.data);
  } catch (e) {
    console.error('[Umami] Error al enviar evento:', e.message);
    res.status(502).json({});
  }
});

// Get latest movies/series (with cache + pagination)
app.get('/api/home', async (req, res) => {
  const source = sanitizeSource(req.query.source);
  const type   = sanitizeType(req.query.type);
  const page   = Math.max(1, Math.min(50, parseInt(req.query.page) || 1)); // clamp page 1-50

  const cacheKey = `home:${source}:${type}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ success: true, items: cached, fromCache: true });
  }

  try {
    let items = [];

    if (source === 'pelisplus') {
      items = type === 'series'
        ? await pelisplus.getLatestSeries(page)
        : await pelisplus.getLatest(page);
    } else if (source === 'pelisplus_la') {
      items = type === 'series'
        ? await pelisplus_la.getLatestSeries(page)
        : await pelisplus_la.getLatest(page);
    } else if (source === 'cuevana') {
      items = type === 'series'
        ? await cuevana.getLatestSeries(page)
        : await cuevana.getLatest(page);
    } else if (source === 'poseidon') {
      items = type === 'series'
        ? await poseidon.getLatestSeries(page)
        : await poseidon.getLatest(page);
    } else if (source === 'all') {
      const [pp, pos] = await Promise.allSettled([
        type === 'series' ? pelisplus.getLatestSeries(page) : pelisplus.getLatest(page),
        type === 'series' ? poseidon.getLatestSeries(page) : poseidon.getLatest(page),
      ]);
      if (pp.status === 'fulfilled') items.push(...pp.value);
      if (pos.status === 'fulfilled') items.push(...pos.value);
    }

    setCache(cacheKey, items, CACHE_TTL.HOME);
    res.json({ success: true, items, fromCache: false });
  } catch (err) {
    console.error('[API /home] Error:', err.message);
    res.json({ success: false, error: err.message, items: [] });
  }
});

// Search (with type filter + cache)
app.get('/api/search', async (req, res) => {
  // Sanitize all incoming parameters
  const query  = sanitizeQuery(Array.isArray(req.query.q) ? req.query.q[0] : req.query.q);
  const source = sanitizeSource(Array.isArray(req.query.source) ? req.query.source[0] : req.query.source);
  const type   = sanitizeType(Array.isArray(req.query.type) ? req.query.type[0] : req.query.type);

  if (!query) {
    return res.status(400).json({ success: false, error: 'El parámetro q es requerido.', items: [] });
  }

  const cacheKey = `search:${source}:${type}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ success: true, items: cached, fromCache: true });
  }

  try {
    let items = [];

    if (source === 'pelisplus' || source === 'all') {
      try { items.push(...(await pelisplus.search(query))); } catch (e) { console.error('[Search PelisPlus]', e.message); }
    }
    if (source === 'poseidon' || source === 'all') {
      try { items.push(...(await poseidon.search(query))); } catch (e) { console.error('[Search Poseidon]', e.message); }
    }
    if (source === 'pelisplus_la' || source === 'all') {
      try { items.push(...(await pelisplus_la.search(query))); } catch (e) { console.error('[Search PelisPlus LA]', e.message); }
    }
    if (source === 'cuevana' || source === 'all') {
      try { items.push(...(await cuevana.search(query))); } catch (e) { console.error('[Search Cuevana]', e.message); }
    }

    // Filter by type if specified
    if (type === 'movies') {
      items = items.filter(i => i.type === 'movie' || i.type === 'anime');
    } else if (type === 'series') {
      items = items.filter(i => i.type === 'series');
    }

    setCache(cacheKey, items, CACHE_TTL.SEARCH);
    res.json({ success: true, items, fromCache: false });
  } catch (err) {
    console.error('[API /search] Error:', err.message);
    res.json({ success: false, error: err.message, items: [] });
  }
});

// Get movie/series detail with video servers (with cache)
app.get('/api/detail', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const source = sanitizeSource(req.query.source);

  const url = typeof rawUrl === 'string' ? rawUrl.trim().slice(0, 500) : '';
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL es requerida.' });
  }

  const cacheKey = `detail:${url}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ success: true, detail: cached, fromCache: true });
  }

  try {
    let detail = null;

    if (source === 'poseidon' || url.includes('poseidon')) {
      detail = await poseidon.getDetail(url);
    } else if (source === 'pelisplus_la' || url.includes('pelisplushd.la')) {
      detail = await pelisplus_la.getDetail(url);
    } else if (source === 'cuevana' || url.includes('cuevana')) {
      detail = await cuevana.getDetail(url);
    } else {
      detail = await pelisplus.getDetail(url);
    }

    if (detail) {
      setCache(cacheKey, detail, CACHE_TTL.DETAIL);
      res.json({ success: true, detail });
    } else {
      res.json({ success: false, error: 'No se pudieron cargar los detalles.' });
    }
  } catch (err) {
    console.error('[API /detail] Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Get video servers for a specific episode
app.get('/api/episodes', async (req, res) => {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const source = sanitizeSource(req.query.source);
  const url = typeof rawUrl === 'string' ? rawUrl.trim().slice(0, 500) : '';

  if (!url) return res.status(400).json({ success: false, error: 'URL es requerida.', servers: [] });

  const cacheKey = `episode:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json({ success: true, servers: cached, fromCache: true });

  try {
    let servers = [];
    if (source === 'poseidon' || url.includes('poseidon')) {
      servers = await poseidon.getEpisodeServers(url);
    } else if (source === 'pelisplus_la' || url.includes('pelisplushd.la')) {
      servers = await pelisplus_la.getEpisodeServers(url);
    } else if (source === 'cuevana' || url.includes('cuevana')) {
      servers = await cuevana.getEpisodeServers(url);
    } else {
      servers = await pelisplus.getEpisodeServers(url);
    }
    setCache(cacheKey, servers, CACHE_TTL.EPISODE);
    res.json({ success: true, servers });
  } catch (err) {
    console.error('[API /episodes] Error:', err.message);
    res.json({ success: false, error: err.message, servers: [] });
  }
});

// ======================== PROXY ========================
app.get('/api/proxy', proxyRateLimit, async (req, res) => {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!targetUrl) {
    return res.status(400).json({ success: false, error: 'URL requerida.' });
  }

  if (!isHostAllowed(targetUrl)) {
    return res.status(403).json({ success: false, error: 'Host no permitido.' });
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        ...PROXY_HEADERS,
        'Referer': new URL(targetUrl).origin + '/',
      },
      timeout: 15000,
      responseType: 'text',
      maxRedirects: 5,
    });

    let html = response.data;
    const origin = new URL(targetUrl).origin;

    if (typeof html === 'string') {
      const popupBlocker = `<script>
(function(){
  var _open = window.open;
  window.open = function(url, name, specs) {
    if (!url || url === '' || url === 'about:blank') return _open.apply(this, arguments);
    console.warn('[PelisStream] Blocked popup:', url);
    return null;
  };
  try {
    Object.defineProperty(window, 'top', { get: function(){ return window; } });
    Object.defineProperty(window, 'parent', { get: function(){ return window; } });
  } catch(e){}
  document.addEventListener('click', function(e) {
    var t = e.target;
    while (t) {
      if (t.tagName === 'A') {
        var href = t.getAttribute('href') || '';
        if (href && href !== '#' && !href.startsWith('javascript') &&
            !href.startsWith('/') && !href.startsWith('${origin}')) {
          var adPatterns = [/\\?var=[a-z0-9]+/i, /bannister/i, /attire/i, /adfly/i, /shorte/i, /ouo\\.io/i, /linkvertise/i];
          if (adPatterns.some(function(p){ return p.test(href); })) {
            e.preventDefault(); e.stopPropagation();
            console.warn('[PelisStream] Blocked ad link:', href);
            return false;
          }
        }
        break;
      }
      t = t.parentElement;
    }
  }, true);
})();
<\/script>`;

      const injection = `<base href="${origin}/">` + popupBlocker;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${injection}`);
      } else if (html.includes('<HEAD>')) {
        html = html.replace('<HEAD>', `<HEAD>${injection}`);
      } else {
        html = injection + '\n' + html;
      }

      html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');
    }

    res.setHeader('Content-Type', response.headers['content-type'] || 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('Content-Security-Policy');
    res.send(html);
  } catch (err) {
    console.error('[Proxy] Error:', err.message);
    res.status(500).send(`<html><body style="background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
      <div style="text-align:center">
        <p style="font-size:18px">⚠️ Error al cargar el servidor</p>
        <p style="color:#888">${err.message}</p>
        <a href="${targetUrl}" target="_blank" style="color:#7c3aed;text-decoration:underline;margin-top:10px;display:inline-block">Abrir en nueva pestaña</a>
      </div>
    </body></html>`);
  }
});

// Fallback — serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  syncRemoteConfig();
  setInterval(syncRemoteConfig, 30 * 60 * 1000);
  startCacheCleanup();

  app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
        }
      }
    }

    console.log(`\n  🎬 PelisStream está corriendo!`);
    console.log(`  ➤ Local:      http://localhost:${PORT}`);
    console.log(`  ➤ Red Local:  http://${localIp}:${PORT}\n`);
  });
}

module.exports = { sanitizeQuery, sanitizeSource, sanitizeType, getCached, setCache, cache, CACHE_TTL };
