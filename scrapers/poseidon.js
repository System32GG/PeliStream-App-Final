const axios = require('axios');
const cheerio = require('cheerio');

const utils = require('./utils');

const BASE_URLS = [
  'https://www.poseidonhd2.co',
  'https://www.poseidonhd.co',
  'https://poseidonhd2.co',
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
        console.log(`[PoseidonHD] Switched to fallback domain: ${BASE_URL}`);
      }
      return res.data;
    } catch (err) {
      console.error(`[PoseidonHD] Error fetching ${attemptUrl}:`, err.message);
    }
  }
  return null;
}

function extractMoviesFromHTML(html) {
  const $ = cheerio.load(html);
  const movies = [];

  const selectors = [
    'li.TPostMv', '.MovieList li', 'article', '.item', '.post', '.card', '.TPost',
    '.peliculas .item', '.series .item', '.items article', '.result-item',
    'div[class*="post"]', 'div[class*="item"]',
  ];

  for (const selector of selectors) {
    $(selector).each((i, el) => {
      const $el = $(el);
      const $link = $el.find('a[href*="/pelicula/"], a[href*="/serie/"]').first();
      if (!$link.length) return;
      const href = $link.attr('href');
      if (!href) return;
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      if (movies.find(m => m.url === fullUrl)) return;

      let image = '';
      const $img = $el.find('img').first();
      if ($img.length) {
        image = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
        if (image.startsWith('//')) image = 'https:' + image;
        if (image.startsWith('/')) image = BASE_URL + image;
      }

      let title = '';
      const $title = $el.find('h2, h3, h4, .title, .Title, .entry-title').first();
      if ($title.length) title = $title.text().trim();
      else title = $link.attr('title') || $img.attr('alt') || $link.text().trim();

      let year = '';
      const yearMatch = title.match(/\((\d{4})\)/);
      if (yearMatch) year = yearMatch[1];
      if (!year) {
        const $year = $el.find('.year, .Year, .metadata span, .extra span').first();
        if ($year.length) { const ym = $year.text().match(/(\d{4})/); if (ym) year = ym[1]; }
      }

      let rating = '';
      const $rating = $el.find('.rating, .vote, .imdb, .Vts').first();
      if ($rating.length) rating = $rating.text().trim();

      let type = (href.includes('/serie/') || href.includes('/series/')) ? 'series' : 'movie';
      title = title.replace(/\s+/g, ' ').replace(/\(\d{4}\)/, '').trim();
      if (title.length < 2 || title.length > 200) return;
      if (!image) return;

      movies.push({ title, year, rating, image, url: fullUrl, type, source: 'poseidon' });
    });
    if (movies.length > 0) break;
  }

  // Fallback
  if (movies.length === 0) {
    $('a[href*="/pelicula/"], a[href*="/serie/"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (!href) return;
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      if (movies.find(m => m.url === fullUrl)) return;
      const $img = $el.find('img').first();
      let image = '';
      if ($img.length) {
        image = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
        if (image.startsWith('//')) image = 'https:' + image;
        if (image.startsWith('/')) image = BASE_URL + image;
      }
      if (!image) return;
      let title = $el.attr('title') || $img.attr('alt') || $el.text().trim();
      title = title.replace(/\s+/g, ' ').replace(/\(\d{4}\)/, '').trim();
      if (title.length < 2 || title.length > 200) return;
      let type = href.includes('/serie/') ? 'series' : 'movie';
      let year = '';
      const ym = $el.text().match(/(\d{4})/);
      if (ym) year = ym[1];
      movies.push({ title, year, rating: '', image, url: fullUrl, type, source: 'poseidon' });
    });
  }

  return movies;
}

async function getLatest(page = 1) {
  const url = page > 1 ? `${BASE_URL}/peliculas/page/${page}` : `${BASE_URL}/peliculas`;
  const html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function getLatestSeries(page = 1) {
  const url = page > 1 ? `${BASE_URL}/series/page/${page}` : `${BASE_URL}/series`;
  const html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function search(query) {
  // Try search engine first
  const searchUrls = [
    `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
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
  const isSeries = url.includes('/serie/');

  const result = {
    title: '',
    year: '',
    image: '',
    description: '',
    genres: [],
    servers: [],
    seasons: [],
    type: isSeries ? 'series' : 'movie',
    url,
    source: 'poseidon',
  };

  result.title = $('h1').first().text().trim() ||
    $('h2.Title, .Title h2').first().text().trim() ||
    $('title').text().split('|')[0].trim().replace(' Online', '').replace('Ver ', '').replace(' - Cuevana', '');

  const $ogImg = $('meta[property="og:image"]');
  if ($ogImg.length) result.image = $ogImg.attr('content') || '';
  if (!result.image) {
    const $img = $('.poster img, .sheader img, .TPost img, article img').first();
    if ($img.length) result.image = $img.attr('data-src') || $img.attr('src') || '';
  }
  if (result.image.startsWith('//')) result.image = 'https:' + result.image;
  if (result.image.startsWith('/')) result.image = BASE_URL + result.image;

  result.description = $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('.Description p, .description p, .sinopsis p, .wp-content p, #info p').first().text().trim() || '';

  $('a[href*="/genero/"], a[href*="/generos/"]').each((i, el) => {
    const genre = $(el).text().trim();
    if (genre && genre.length > 1 && genre.length < 30 && !result.genres.includes(genre)) result.genres.push(genre);
  });
  result.genres = result.genres.slice(0, 6);

  const yearMatch = result.title.match(/\((\d{4})\)/) ||
    $('span.year, .date, .Year, .extra span').first().text().match(/(\d{4})/);
  if (yearMatch) result.year = yearMatch[1];

  // ========== SERIES: EXTRACT SEASONS & EPISODES ==========
  if (isSeries) {
    const seasonsMap = new Map();

    // Strategy A: season containers
    $('[class*="temporada"], [class*="season"], [id*="season"], [id*="temporada"]').each((i, el) => {
      const $sec = $(el);
      const seasonAttr = $sec.attr('data-season') || $sec.attr('data-temporada') || '';
      const titleText = $sec.find('h2, h3, h4, .title-season, .season-title').first().text();
      const seasonTextMatch = titleText.match(/(\d+)/);
      const seasonNum = parseInt(seasonAttr) || (seasonTextMatch ? parseInt(seasonTextMatch[1]) : i + 1);

      const episodesArr = [];
      $sec.find('a[href*="/episodio/"], a[href*="/capitulo/"], a[href*="episode-"], a[href*="episodio-"]').each((j, epEl) => {
        const $ep = $(epEl);
        const epHref = $ep.attr('href');
        if (!epHref) return;
        const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
        const epNumMatch = epHref.match(/(?:episodio|capitulo|episode)[/-]?(\d+)/i);
        const epNum = epNumMatch ? parseInt(epNumMatch[1]) : j + 1;
        episodesArr.push({ number: epNum, title: $ep.text().trim() || `Episodio ${epNum}`, url: epUrl });
      });

      if (episodesArr.length === 0) {
        $sec.find('li a').each((j, aEl) => {
          const epHref = $(aEl).attr('href') || '';
          if (!epHref || (!epHref.includes('/episodio') && !epHref.includes('/capitulo') && !epHref.includes('episode'))) return;
          const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
          const epNumMatch = epHref.match(/(\d+)(?:\/?$)/);
          const epNum = epNumMatch ? parseInt(epNumMatch[1]) : j + 1;
          episodesArr.push({ number: epNum, title: $(aEl).text().trim() || `Episodio ${epNum}`, url: epUrl });
        });
      }

      if (episodesArr.length > 0) {
        const existing = seasonsMap.get(seasonNum) || [];
        seasonsMap.set(seasonNum, [...existing, ...episodesArr]);
      }
    });

    // Strategy B: flat episode links with season detection
    if (seasonsMap.size === 0) {
      $('a[href*="/episodio/"], a[href*="/capitulo/"], a[href*="episode-"]').each((i, el) => {
        const $a = $(el);
        const epHref = $a.attr('href');
        if (!epHref) return;
        const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
        const seasonMatch = epHref.match(/(\d+)[x×](\d+)/i) ||
          epHref.match(/temporada[/-]?(\d+).*(?:episodio|capitulo)[/-]?(\d+)/i) ||
          epHref.match(/season[/-]?(\d+).*episode[/-]?(\d+)/i);
        let seasonNum = 1, epNum = i + 1;
        if (seasonMatch) { seasonNum = parseInt(seasonMatch[1]); epNum = parseInt(seasonMatch[2]); }
        else { const nm = epHref.match(/(?:episodio|capitulo|episode)[/-]?(\d+)/i); if (nm) epNum = parseInt(nm[1]); }
        const existing = seasonsMap.get(seasonNum) || [];
        if (!existing.find(e => e.url === epUrl)) {
          existing.push({ number: epNum, title: $a.text().trim() || `Episodio ${epNum}`, url: epUrl });
          seasonsMap.set(seasonNum, existing);
        }
      });
    }

    result.seasons = Array.from(seasonsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, episodes]) => ({
        number: num,
        episodes: episodes.sort((a, b) => a.number - b.number),
      }));
  }

  // Only extract servers for movies or if no episodes found
  if (!isSeries || result.seasons.length === 0) {
    extractServers($, html, result, BASE_URL);
  }

  return result;
}

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
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src && utils.isVideoUrl(src) && !utils.isAdUrl(src)) {
      let embedUrl = src.startsWith('//') ? 'https:' + src : src;
      if (!result.servers.find(s => s.embedUrl === embedUrl)) {
        result.servers.push({ name: utils.extractServerName(embedUrl), embedUrl });
      }
    }
  });

  // Strategy 2: poseidon player URL
  const playerUrlPattern = /https?:\/\/player\.poseidonhd2?\.co\/[^"'\s<>]+/gi;
  const playerMatches = html.match(playerUrlPattern);
  if (playerMatches) {
    for (let m of playerMatches) {
      m = m.replace(/["'\\;,)\]}>]+$/, '');
      if (!utils.isAdUrl(m) && !result.servers.find(s => s.embedUrl === m)) {
        result.servers.push({ name: m.includes('download') ? 'Descargar' : 'PoseidonPlayer', embedUrl: m });
      }
    }
  }

  // Strategy 3: known video hosts
  const videoHostPatterns = [
    /https?:\/\/[^"'\s<>]*streamwish\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*filemoon\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*vidhide\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*voe[sx]?\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*dood(?:stream)?\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*netu\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*hqq\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*embed69\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*upstream\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*mixdrop\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*waaw\.[^"'\s<>]+/gi,
    /https?:\/\/[^"'\s<>]*peliscloud\.[^"'\s<>]+/gi,
  ];
  for (const pattern of videoHostPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (let m of matches) {
        m = m.replace(/["'\\;,)\]}>]+$/, '');
        if (!utils.isAdUrl(m) && !result.servers.find(s => s.embedUrl === m)) {
          result.servers.push({ name: utils.extractServerName(m), embedUrl: m });
        }
      }
    }
  }

  // Strategy 4: server list with data-video / data-embed
  $('li[data-video], li[data-embed], li[data-url], .TPlayerNv li, .server-list li, .serversList li, ul.aa-cnt li').each((i, el) => {
    const $li = $(el);
    const embedUrl = $li.attr('data-video') || $li.attr('data-embed') || $li.attr('data-url') || '';
    if (embedUrl && !utils.isAdUrl(embedUrl)) {
      let url = embedUrl.startsWith('//') ? 'https:' + embedUrl : embedUrl;
      if (!result.servers.find(s => s.embedUrl === url)) {
        result.servers.push({ name: $li.text().trim() || utils.extractServerName(url), embedUrl: url });
      }
    }
  });
}

module.exports = { getLatest, getLatestSeries, search, getDetail, getEpisodeServers, setBaseUrl };
