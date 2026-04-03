const axios = require('axios');
const cheerio = require('cheerio');

const utils = require('./utils');

// Fallback domains in case primary is down
const BASE_URLS = [
  'https://pelisplushd.bz',
  'https://pelisplus.app',
  'https://pelisplushd.net',
];
let BASE_URL = BASE_URLS[0];

function setBaseUrl(url) {
  if (url) BASE_URL = url;
}


const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Referer': BASE_URL,
};

async function fetchPage(url) {
  const attemptUrls = [url];
  const oldBaseMatch = BASE_URLS.find(b => url.startsWith(b));
  if (oldBaseMatch) {
    for (let i = 0; i < BASE_URLS.length; i++) {
        if (BASE_URLS[i] !== oldBaseMatch) {
            attemptUrls.push(url.replace(oldBaseMatch, BASE_URLS[i]));
        }
    }
  }
  for (const attemptUrl of attemptUrls) {
    try {
      const res = await axios.get(attemptUrl, {
        headers: { ...HEADERS, Referer: new URL(attemptUrl).origin },
        timeout: 15000,
        maxRedirects: 5,
      });
      const origin = new URL(attemptUrl).origin;
      if (origin !== BASE_URL) {
        BASE_URL = origin;
        console.log(`[PelisPlus] Switched to fallback domain: ${BASE_URL}`);
      }
      return res.data;
    } catch (err) {
      console.error(`[PelisPlus] Error fetching ${attemptUrl}:`, err.message);
    }
  }
  return null;
}

function extractMoviesFromHTML(html) {
  const $ = cheerio.load(html);
  const movies = [];

  $('a[href*="/pelicula/"], a[href*="/serie/"], a[href*="/anime/"]').each((i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const $img = $el.find('img').first();
    if (!$img.length && !$el.closest('article, .post, .card, .item, .Posters, .items').length) return;
    if (!href || (!href.includes('/pelicula/') && !href.includes('/serie/') && !href.includes('/anime/'))) return;

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    let image = '';
    if ($img.length) {
      image = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
      if (image.startsWith('//')) image = 'https:' + image;
      if (image.startsWith('/')) image = BASE_URL + image;
    }

    let title = '';
    const $titleEl = $el.find('h2, h3, .Title, .title, .entry-title').first();
    if ($titleEl.length) title = $titleEl.text().trim();
    else title = $el.attr('title') || $img.attr('alt') || $el.text().trim();

    let year = '';
    const yearMatch = title.match(/\((\d{4})\)/);
    if (yearMatch) year = yearMatch[1];
    if (!year) {
      const $year = $el.find('.Year, .year, .Qlty, span').first();
      if ($year.length) {
        const ym = $year.text().trim().match(/(\d{4})/);
        if (ym) year = ym[1];
      }
    }

    let rating = '';
    const $rating = $el.find('.rating, .vote, .Vts, .imdb').first();
    if ($rating.length) rating = $rating.text().trim();
    const ratingMatch = $el.text().match(/([\d.]+)\/10/);
    if (!rating && ratingMatch) rating = ratingMatch[1];

    let type = 'movie';
    if (href.includes('/serie/')) type = 'series';
    if (href.includes('/anime/')) type = 'anime';

    title = title.replace(/\s+/g, ' ')
      .replace(/^VER\s+/i, '')
      .replace(/\s+Online\s*(Gratis)?\s*(HD)?$/i, '')
      .replace(/\s*-\s*Pelisplus$/i, '')
      .replace(/\s*-\s*PelisPlusHD$/i, '')
      .replace(/\(?\d{4}\)?/, '')
      .trim();
    if (title.length < 2 || title.length > 200) return;
    if (movies.find(m => m.url === fullUrl)) return;
    if (!image) return;

    movies.push({ title, year, rating, image, url: fullUrl, type, source: 'pelisplus' });
  });

  return movies;
}

async function getLatest(page = 1) {
  const url = page > 1 ? `${BASE_URL}/peliculas?page=${page}` : `${BASE_URL}/peliculas`;
  const html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function getLatestSeries(page = 1) {
  const url = page > 1 ? `${BASE_URL}/series?page=${page}` : `${BASE_URL}/series`;
  const html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function search(query) {
  const searchUrls = [
    `${BASE_URL}/search?s=${encodeURIComponent(query)}`,
    `${BASE_URL}/buscar?q=${encodeURIComponent(query)}`,
    `${BASE_URL}/?s=${encodeURIComponent(query)}`,
  ];
  for (const url of searchUrls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const movies = extractMoviesFromHTML(html);
    if (movies.length > 0) return movies;
  }
  return [];
}

async function getDetail(url) {
  const html = await fetchPage(url);
  if (!html) return null;

  const $ = cheerio.load(html);
  const isSeries = url.includes('/serie/') || url.includes('/anime/');

  const result = {
    title: '',
    year: '',
    image: '',
    description: '',
    genres: [],
    servers: [],
    seasons: [],   // Array of { number, episodes: [{number, title, url}] }
    type: isSeries ? 'series' : 'movie',
    url,
    source: 'pelisplus',
  };

  result.title = $('h1').first().text().trim() ||
    $('h2.Title, .Title h2, .sheader h1').first().text().trim() ||
    $('title').text().split('|')[0].trim().replace(' Online', '').replace(' - Pelisplus', '');

  const $poster = $('img.TPostBg, .TPost img, .sheader img, .poster img, meta[property="og:image"]');
  if ($poster.length) {
    result.image = $poster.attr('content') || $poster.attr('data-src') || $poster.attr('src') || '';
    if (result.image.startsWith('//')) result.image = 'https:' + result.image;
    if (result.image.startsWith('/')) result.image = BASE_URL + result.image;
  }

  result.description = $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('.Description p, .description p, .wp-content p, .info p, .sinopsis p').first().text().trim() || '';

  const genreScope = $('.info-content, .sheader, .sgeneros, .data, article, .wp-content, .mvic-desc, .content-movie');
  const seenGenres = new Set();
  (genreScope.length ? genreScope : $('body')).find('a[href*="/generos/"], a[href*="/genero/"]').each((i, el) => {
    const genre = $(el).text().trim();
    if (genre && genre.length > 1 && genre.length < 30 && !seenGenres.has(genre)) {
      seenGenres.add(genre);
      result.genres.push(genre);
    }
  });
  result.genres = result.genres.slice(0, 6);

  const yearMatch = result.title.match(/\((\d{4})\)/) ||
    $('span.year, .date, .Year').first().text().match(/(\d{4})/);
  if (yearMatch) result.year = yearMatch[1];

  // ========== SERIES: EXTRACT SEASONS & EPISODES ==========
  if (isSeries) {
    const seasonsMap = new Map(); // seasonNum -> [episodes]

    // Strategy A: .temporadas / .seasons containers with season number
    $('[class*="temporada"], [class*="season"], [id*="season"], [id*="temporada"]').each((i, el) => {
      const $sec = $(el);
      const seasonAttr = $sec.attr('data-season') || $sec.attr('data-temporada') || '';
      const seasonTextMatch = ($sec.find('h2, h3, h4, .title-season, .season-title').first().text() || '').match(/(\d+)/);
      const seasonNum = parseInt(seasonAttr) || (seasonTextMatch ? parseInt(seasonTextMatch[1]) : i + 1);

      const episodesArr = [];
      $sec.find('a[href*="/episodio/"], a[href*="/capitulo/"], a[href*="episode-"], a[href*="episodio-"], a[href*="capitulo-"]').each((j, epEl) => {
        const $ep = $(epEl);
        const epHref = $ep.attr('href');
        if (!epHref) return;
        const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
        const epNumMatch = epHref.match(/(?:episodio|capitulo|episode)[/-]?(\d+)/i);
        const epNum = epNumMatch ? parseInt(epNumMatch[1]) : j + 1;
        const epTitle = $ep.text().trim() || `Episodio ${epNum}`;
        episodesArr.push({ number: epNum, title: epTitle, url: epUrl });
      });

      // If no episodes found via anchor, look for li items
      if (episodesArr.length === 0) {
        $sec.find('li').each((j, liEl) => {
          const $li = $(liEl);
          const $a = $li.find('a').first();
          const epHref = $a.attr('href') || '';
          if (!epHref || (!epHref.includes('/episodio') && !epHref.includes('/capitulo') && !epHref.includes('episode'))) return;
          const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
          const epNumMatch = epHref.match(/(\d+)(?:\/?$)/);
          const epNum = epNumMatch ? parseInt(epNumMatch[1]) : j + 1;
          const epTitle = $a.text().trim() || $li.text().trim() || `Episodio ${epNum}`;
          episodesArr.push({ number: epNum, title: epTitle, url: epUrl });
        });
      }

      if (episodesArr.length > 0) {
        const existing = seasonsMap.get(seasonNum) || [];
        seasonsMap.set(seasonNum, [...existing, ...episodesArr]);
      }
    });

    // Strategy B: Direct episode links anywhere in the page (flat list fallback)
    if (seasonsMap.size === 0) {
      const flatEpisodes = [];
      $('a[href*="/episodio/"], a[href*="/capitulo/"], a[href*="episode-"], a[href*="episodio-"]').each((i, el) => {
        const $a = $(el);
        const epHref = $a.attr('href');
        if (!epHref) return;
        const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
        if (flatEpisodes.find(e => e.url === epUrl)) return;
        // Try to detect season from URL: /serie/name/1x05 or /serie/name/season-1/episode-5
        const seasonMatch = epHref.match(/(\d+)[x×](\d+)/i) ||
          epHref.match(/temporada[/-]?(\d+).*(?:episodio|capitulo)[/-]?(\d+)/i) ||
          epHref.match(/season[/-]?(\d+).*episode[/-]?(\d+)/i);
        let seasonNum = 1, epNum = i + 1;
        if (seasonMatch) {
          seasonNum = parseInt(seasonMatch[1]);
          epNum = parseInt(seasonMatch[2]);
        } else {
          const numMatch = epHref.match(/(?:episodio|capitulo|episode)[/-]?(\d+)/i);
          if (numMatch) epNum = parseInt(numMatch[1]);
        }
        const epTitle = $a.text().trim() || `Episodio ${epNum}`;
        flatEpisodes.push({ number: epNum, title: epTitle, url: epUrl, season: seasonNum });
      });

      // Group by season
      for (const ep of flatEpisodes) {
        const s = ep.season || 1;
        const arr = seasonsMap.get(s) || [];
        arr.push({ number: ep.number, title: ep.title, url: ep.url });
        seasonsMap.set(s, arr);
      }
    }

    // Build sorted seasons array
    result.seasons = Array.from(seasonsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, episodes]) => ({
        number: num,
        episodes: episodes.sort((a, b) => a.number - b.number),
      }));
  }

  // ========== MOVIE/EPISODE: video server extraction ==========
  if (!isSeries || result.seasons.length === 0) {
    extractServers($, html, result, BASE_URL);
  }

  return result;
}

// Get video servers for a specific episode URL
async function getEpisodeServers(episodeUrl) {
  const html = await fetchPage(episodeUrl);
  if (!html) return [];
  const $ = cheerio.load(html);
  const temp = { servers: [] };
  extractServers($, html, temp, BASE_URL);
  return temp.servers;
}

function extractServers($, html, result, baseUrl) {
  // Strategy 1: iframes
  $('iframe').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    if (src && utils.isVideoUrl(src) && !utils.isAdUrl(src)) {
      let embedUrl = src.startsWith('//') ? 'https:' + src : src;
      if (!result.servers.find(s => s.embedUrl === embedUrl)) {
        result.servers.push({ name: utils.extractServerName(embedUrl), embedUrl });
      }
    }
  });

  // Strategy 2: known video hosts in source
  const videoHostPatterns = [
    /https?:\/\/[^"'\s]*streamwish\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*filemoon\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*vidhide\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*voe[sx]?\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*dood(?:stream)?\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*netu\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*embed69\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*upstream\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*mixdrop\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*mp4upload\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*uqload\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*hqq\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*waaw\.[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*peliscloud\.[^"'\s]+/gi,
    /\/\/[^"'\s]*embed[^"'\s]*/gi,
  ];
  for (const pattern of videoHostPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (let m of matches) {
        m = m.replace(/["'\\;,)\]}>]+$/, '');
        if (m.startsWith('//')) m = 'https:' + m;
        if (!utils.isAdUrl(m) && !result.servers.find(s => s.embedUrl === m) && utils.isVideoUrl(m)) {
          result.servers.push({ name: utils.extractServerName(m), embedUrl: m });
        }
      }
    }
  }

  // Strategy 3: data attributes
  $('[data-tplayernv], [data-src], [data-player], [data-url], [data-embed]').each((i, el) => {
    ['data-src', 'data-player', 'data-url', 'data-embed'].forEach(attr => {
      const val = $(el).attr(attr);
      if (val && utils.isVideoUrl(val) && !utils.isAdUrl(val)) {
        let embedUrl = val.startsWith('//') ? 'https:' + val : val;
        if (!result.servers.find(s => s.embedUrl === embedUrl)) {
          result.servers.push({ name: utils.extractServerName(embedUrl), embedUrl });
        }
      }
    });
  });

  // Strategy 4: server list items
  $('li[data-tplayernv], .TPlayerNv li, .options li, .serversList li, .server-item').each((i, el) => {
    const $li = $(el);
    const optionId = $li.attr('data-tplayernv') || $li.attr('data-id') || '';
    const name = $li.text().trim();
    if (optionId) {
      const $container = $(`#${optionId}, .TPlayerTb[id="${optionId}"], div[data-id="${optionId}"]`);
      const $iframe = $container.find('iframe');
      if ($iframe.length) {
        const src = $iframe.attr('src') || $iframe.attr('data-src') || '';
        if (src && !utils.isAdUrl(src)) {
          let embedUrl = src.startsWith('//') ? 'https:' + src : src;
          if (!result.servers.find(s => s.embedUrl === embedUrl)) {
            result.servers.push({ name: name || utils.extractServerName(embedUrl), embedUrl });
          }
        }
      }
    }
  });
}

module.exports = { getLatest, getLatestSeries, search, getDetail, getEpisodeServers, setBaseUrl };
