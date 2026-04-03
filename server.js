const express = require('express');
const os = require('os');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const pelisplus = require('./scrapers/pelisplus');
const poseidon = require('./scrapers/poseidon');
const pelisplus_la = require('./scrapers/pelisplus_la');
const cuevana = require('./scrapers/cuevana');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PROXY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

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
  } catch(e) {
    console.error('[Server] Error sincronizando Remote Config:', e.message);
  }
}
syncRemoteConfig();
setInterval(syncRemoteConfig, 30 * 60 * 1000); // 30 minutos

// ======================== IN-MEMORY CACHE ========================
// Cache entries: { data, expiresAt }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ======================== PROXY RATE LIMITING ========================
const proxyRequests = new Map(); // ip -> { count, windowStart }
const PROXY_LIMIT = 30;          // max requests per window
const PROXY_WINDOW_MS = 60 * 1000; // 1 minute window

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

function proxyRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = proxyRequests.get(ip);

  if (!record || now - record.windowStart > PROXY_WINDOW_MS) {
    proxyRequests.set(ip, { count: 1, windowStart: now });
    return next();
  }

  if (record.count >= PROXY_LIMIT) {
    return res.status(429).send('Too many proxy requests. Try again in a minute.');
  }

  record.count++;
  next();
}

// Periodic cleanup of rate limit map (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of proxyRequests.entries()) {
    if (now - record.windowStart > PROXY_WINDOW_MS) proxyRequests.delete(ip);
  }
}, 5 * 60 * 1000);

// ======================== API ROUTES ========================

// Remote Config Endpoint
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: currentRemoteConfig });
});

// Get latest movies/series (with cache + pagination)

app.get('/api/home', async (req, res) => {
  const source = req.query.source || 'pelisplus';
  const type = req.query.type || 'movies';
  const page = parseInt(req.query.page) || 1;

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

    setCache(cacheKey, items);
    res.json({ success: true, items, fromCache: false });
  } catch (err) {
    console.error('[API /home] Error:', err.message);
    res.json({ success: false, error: err.message, items: [] });
  }
});

// Search (with type filter + cache)
app.get('/api/search', async (req, res) => {
  const queryRaw = req.query.q || '';
  const query = Array.isArray(queryRaw) ? queryRaw[0] : queryRaw;
  const sourceRaw = req.query.source || 'all';
  const source = Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw;
  const typeRaw = req.query.type || 'all'; // 'movies', 'series', or 'all'
  const type = Array.isArray(typeRaw) ? typeRaw[0] : typeRaw;

  if (!query) {
    return res.json({ success: false, error: 'Query is required', items: [] });
  }

  const cacheKey = `search:${source}:${type}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ success: true, items: cached, fromCache: true });
  }

  try {
    let items = [];

    if (source === 'pelisplus' || source === 'all') {
      try {
        const ppItems = await pelisplus.search(query);
        items.push(...ppItems);
      } catch (e) {
        console.error('[Search PelisPlus] Error:', e.message);
      }
    }

    if (source === 'poseidon' || source === 'all') {
      try {
        const posItems = await poseidon.search(query);
        items.push(...posItems);
      } catch (e) {
        console.error('[Search Poseidon] Error:', e.message);
      }
    }

    if (source === 'pelisplus_la' || source === 'all') {
      try { items.push(...(await pelisplus_la.search(query))); } catch (e) {
        console.error('[Search PelisPlus LA] Error:', e.message);
      }
    }
    if (source === 'cuevana' || source === 'all') {
      try { items.push(...(await cuevana.search(query))); } catch (e) {
        console.error('[Search Cuevana] Error:', e.message);
      }
    }

    // Filter by type if specified
    if (type === 'movies') {
      items = items.filter(i => i.type === 'movie' || i.type === 'anime');
    } else if (type === 'series') {
      items = items.filter(i => i.type === 'series');
    }

    setCache(cacheKey, items);
    res.json({ success: true, items, fromCache: false });
  } catch (err) {
    console.error('[API /search] Error:', err.message);
    res.json({ success: false, error: err.message, items: [] });
  }
});

// Get movie/series detail with video servers (with cache)
app.get('/api/detail', async (req, res) => {
  const url = req.query.url || '';
  const source = req.query.source || '';

  if (!url) {
    return res.json({ success: false, error: 'URL is required' });
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
      setCache(cacheKey, detail);
      res.json({ success: true, detail });
    } else {
      res.json({ success: false, error: 'Could not load details' });
    }
  } catch (err) {
    console.error('[API /detail] Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Get video servers for a specific episode
app.get('/api/episodes', async (req, res) => {
  const url = req.query.url || '';
  const source = req.query.source || '';

  if (!url) return res.json({ success: false, error: 'URL is required', servers: [] });

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
    setCache(cacheKey, servers);
    res.json({ success: true, servers });
  } catch (err) {
    console.error('[API /episodes] Error:', err.message);
    res.json({ success: false, error: err.message, servers: [] });
  }
});

// Proxy endpoint — fetches and serves external pages for iframe embedding
app.get('/api/proxy', proxyRateLimit, async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('URL required');
  }

  // Security: only allow whitelisted hosts
  if (!isHostAllowed(targetUrl)) {
    return res.status(403).send('Host not allowed');
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
      // Popup blocker script — injected as early as possible
      const popupBlocker = `<script>
(function(){
  // Block window.open (pop-unders, new tab ads)
  var _open = window.open;
  window.open = function(url, name, specs) {
    if (!url || url === '' || url === 'about:blank') return _open.apply(this, arguments);
    console.warn('[PelisStream] Blocked popup:', url);
    return null;
  };
  // Block top-level navigation tricks (window.top.location, window.parent.location)
  try {
    Object.defineProperty(window, 'top', { get: function(){ return window; } });
    Object.defineProperty(window, 'parent', { get: function(){ return window; } });
  } catch(e){}
  // Block document.write-based redirects on body click
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

      // Inject popup blocker + base tag into <head>
      const injection = `<base href="${origin}/">` + popupBlocker;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${injection}`);
      } else if (html.includes('<HEAD>')) {
        html = html.replace('<HEAD>', `<HEAD>${injection}`);
      } else {
        html = injection + '\n' + html;
      }

      // Remove X-Frame-Options meta tags
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

app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
      }
    }
  }

  console.log(`\n  🎬 PelisStream está corriendo!`);
  console.log(`  ➤ Local:      http://localhost:${PORT}`);
  console.log(`  ➤ Red Local:  http://${localIp}:${PORT}\n`);
});
