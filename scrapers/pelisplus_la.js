const axios = require('axios');
const cheerio = require('cheerio');
const utils = require('./utils');

let BASE_URL = 'https://www.pelisplushd.la';

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
  try {
    const res = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
    });
    return res.data;
  } catch (err) {
    console.error(`[PelisPlusLA] Error fetching ${url}:`, err.message);
    return null;
  }
}

function extractMoviesFromHTML(html) {
  const $ = cheerio.load(html);
  const movies = [];

  $('a[href*="/pelicula/"], a[href*="/serie/"], a[href*="/anime/"]').each((i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    
    // Some containers don't have images inside the 'a' tag but in a parent div
    const parentContainer = $el.closest('article, .post, .card, .item, .items, .Posters');
    const $img = $el.find('img').length ? $el.find('img').first() : parentContainer.find('img').first();
    
    let image = '';
    if ($img.length) {
      image = $img.attr('data-src') || $img.attr('src') || '';
      if (image.startsWith('//')) image = 'https:' + image;
      else if (image.startsWith('/')) image = BASE_URL + image;
    }

    let title = '';
    const $titleEl = $el.find('h2, h3, .Title, .title, .entry-title').first();
    if ($titleEl.length) title = $titleEl.text().trim();
    else title = $el.attr('title') || $img.attr('alt') || $el.text().trim();
    
    // Clean title
    title = title.replace(/\s+/g, ' ')
      .replace(/^VER\s+/i, '')
      .replace(/\s+Online\s*(Gratis)?\s*(HD)?$/i, '')
      .replace(/\s*-\s*Pelisplus.*$/i, '')
      .replace(/\(?\d{4}\)?/, '')
      .trim();
      
    if (title.length < 2 || title.length > 200 || !image) return;

    let year = '';
    const yearMatch = title.match(/\((\d{4})\)/);
    if (yearMatch) year = yearMatch[1];
    if (!year) {
      const $year = parentContainer.find('.Year, .year, span').first();
      if ($year.length) {
        const ym = $year.text().trim().match(/(\d{4})/);
        if (ym) year = ym[1];
      }
    }

    let type = 'movie';
    if (fullUrl.includes('/serie/')) type = 'series';
    if (fullUrl.includes('/anime/')) type = 'anime';

    if (!movies.find(m => m.url === fullUrl)) {
      movies.push({ title, year, image, url: fullUrl, type, source: 'pelisplus_la' });
    }
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
  let html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function search(query) {
  const searchUrl = `${BASE_URL}/buscar?q=${encodeURIComponent(query)}`;
  const html = await fetchPage(searchUrl);
  if (!html) return [];
  // Use heuristic since search URLs might vary
  const movies = extractMoviesFromHTML(html);
  return movies.length ? movies : extractMoviesFromHTML(await fetchPage(`${BASE_URL}/search?s=${encodeURIComponent(query)}`));
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
    seasons: [],
    type: isSeries ? 'series' : 'movie',
    url,
    source: 'pelisplus_la',
  };

  result.title = $('h1').first().text().trim() || $('title').text().split('|')[0].trim();
  
  const $poster = $('meta[property="og:image"], img.TPostBg, .poster img');
  if ($poster.length) {
    result.image = $poster.attr('content') || $poster.attr('src') || $poster.attr('data-src') || '';
    if (result.image.startsWith('//')) result.image = 'https:' + result.image;
    else if (result.image.startsWith('/')) result.image = BASE_URL + result.image;
  }

  result.description = $('meta[property="og:description"]').attr('content') ||
    $('.Description p, .sinopsis p').first().text().trim() || '';

  $('a[href*="/generos/"], a[href*="/genero/"]').each((i, el) => {
    const genre = $(el).text().trim();
    if (genre && !result.genres.includes(genre)) result.genres.push(genre);
  });
  result.genres = result.genres.slice(0, 6);

  const yearMatch = result.title.match(/\((\d{4})\)/) || $('.date, .year').first().text().match(/(\d{4})/);
  if (yearMatch) result.year = yearMatch[1];

  if (isSeries) {
    // Exact same parsing logic as pelisplus.js since the themes are identical
    const seasonsMap = new Map();
    $('[class*="temporada"], [data-season]').each((i, el) => {
      const $sec = $(el);
      const sAttr = $sec.attr('data-season') || $sec.attr('data-temporada');
      const textMatch = ($sec.find('h2, h3').text() || '').match(/(\d+)/);
      const sn = parseInt(sAttr) || (textMatch ? parseInt(textMatch[1]) : i + 1);

      const eps = [];
      $sec.find('a[href*="/episodio/"], a[href*="/capitulo/"]').each((j, epEl) => {
        const epHref = $(epEl).attr('href');
        if (!epHref) return;
        const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
        const epNumMatch = epHref.match(/(?:episodio|capitulo)[/-]?(\d+)/i);
        const epNum = epNumMatch ? parseInt(epNumMatch[1]) : j + 1;
        eps.push({ number: epNum, title: $(epEl).text().trim() || `Episodio ${epNum}`, url: epUrl });
      });
      if(eps.length > 0) seasonsMap.set(sn, eps);
    });
    
    result.seasons = Array.from(seasonsMap.entries())
      .sort((a,b) => a[0] - b[0])
      .map(([num, episodes]) => ({ number: num, episodes: episodes.sort((a,b) => a.number - b.number) }));
  }

  if (!isSeries || result.seasons.length === 0) {
    extractServers($, html, result);
  }

  return result;
}

async function getEpisodeServers(episodeUrl) {
  const html = await fetchPage(episodeUrl);
  if (!html) return [];
  const $ = cheerio.load(html);
  const temp = { servers: [] };
  extractServers($, html, temp);
  return temp.servers;
}

function extractServers($, html, result) {
  // Try standard iframes
  $('iframe').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src && isVideoUrl(src)) {
      const embedUrl = src.startsWith('//') ? 'https:' + src : src;
      if (!result.servers.find(s => s.embedUrl === embedUrl)) {
        result.servers.push({ name: extractServerName(embedUrl), embedUrl });
      }
    }
  });

  // Try parsing data from script tags
  const ptns = [ /https?:\/\/[^"'\s]*streamwish\.[^"'\s]+/gi, /https?:\/\/[^"'\s]*filemoon\.[^"'\s]+/gi, /https?:\/\/[^"'\s]*vidhide\.[^"'\s]+/gi, /https?:\/\/[^"'\s]*voe[sx]?\.[^"'\s]+/gi, /https?:\/\/[^"'\s]*dood(?:stream)?\.[^"'\s]+/gi, /https?:\/\/[^"'\s]*up(?:stream|top)\.[^"'\s]+/gi ];
  ptns.forEach(p => {
    const ms = html.match(p);
    if(ms) {
      ms.forEach(m => {
        m = m.replace(/["'\\;,)\]}>]+$/, '');
        if (utils.isVideoUrl(m) && !result.servers.find(s => s.embedUrl === m)) {
          result.servers.push({ name: utils.extractServerName(m), embedUrl: m });
        }
      });
    }
  });
  
  // li attributes
  $('li[data-video], li[data-url], li[data-server]').each((i, el) => {
    const val = $(el).attr('data-video') || $(el).attr('data-url');
    if (val && utils.isVideoUrl(val) && !val.includes('youtube')) {
      const u = val.startsWith('//') ? 'https:' + val : val;
      if(!result.servers.find(s => s.embedUrl === u)) {
        result.servers.push({ name: $(el).text().trim() || utils.extractServerName(u), embedUrl: u });
      }
    }
  });
}

module.exports = { getLatest, getLatestSeries, search, getDetail, getEpisodeServers, setBaseUrl };
