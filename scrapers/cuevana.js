const axios = require('axios');
const cheerio = require('cheerio');
const utils = require('./utils');

let BASE_URL = 'https://ww9.cuevana3.to';

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
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    return res.data;
  } catch (err) {
    console.error(`[Cuevana] Error fetching ${url}:`, err.message);
    return null;
  }
}

function extractMoviesFromHTML(html) {
  const $ = cheerio.load(html);
  const movies = [];

  $('a[href*="/pelicula/"], a[href*="/serie/"], a.TPost, a.item').each((i, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;
    
    // Some links might just point to /estrenos or /genero
    if (!href.includes('/pelicula/') && !href.includes('/serie/') && !href.match(/\/\d+\/[\w-]+/)) return;

    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const parentContainer = $el.closest('li, article, .TPost, .item, .post');
    const $img = $el.find('img').length ? $el.find('img').first() : parentContainer.find('img').first();
    
    let image = '';
    if ($img.length) {
      image = $img.attr('data-src') || $img.attr('src') || '';
      if (image.startsWith('//')) image = 'https:' + image;
      else if (image.startsWith('/')) image = BASE_URL + image;
    }

    let title = '';
    const $titleEl = $el.find('h2, h3, .Title, .title').first();
    if ($titleEl.length) title = $titleEl.text().trim();
    else title = $el.attr('title') || $img.attr('alt') || $el.text().trim();
    
    title = title.replace(/\s+/g, ' ').replace(/^Cuevana 3\s*/i, '').replace(/\(?\d{4}\)?/, '').trim();
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

    if (!movies.find(m => m.url === fullUrl)) {
      movies.push({ title, year, image, url: fullUrl, type, source: 'cuevana' });
    }
  });

  return movies;
}

async function getLatest(page = 1) {
  const url = page > 1 ? `${BASE_URL}/peliculas/page/${page}` : `${BASE_URL}/peliculas`;
  const html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function getLatestSeries(page = 1) {
  const url = page > 1 ? `${BASE_URL}/serie/page/${page}` : `${BASE_URL}/serie`;
  let html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function search(query) {
  const url = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const html = await fetchPage(url);
  if (!html) return [];
  return extractMoviesFromHTML(html);
}

async function getDetail(url) {
  const html = await fetchPage(url);
  if (!html) return null;

  const $ = cheerio.load(html);
  const isSeries = url.includes('/serie/');

  const result = {
    title: '', year: '', image: '', description: '', genres: [], servers: [], seasons: [], type: isSeries ? 'series' : 'movie', url, source: 'cuevana'
  };

  result.title = $('h1').first().text().trim() || $('title').text().split('|')[0].trim().replace('Cuevana', '').trim();
  
  const $poster = $('meta[property="og:image"], .TPostBg, .poster img, .Image img');
  if ($poster.length) {
    result.image = $poster.attr('content') || $poster.attr('src') || $poster.attr('data-src') || '';
    if (result.image.startsWith('//')) result.image = 'https:' + result.image;
    else if (result.image.startsWith('/')) result.image = BASE_URL + result.image;
  }

  result.description = $('meta[property="og:description"]').attr('content') || $('.Description p, .sinopsis p').first().text().trim() || '';

  $('a[href*="/category/"], a[href*="/genero/"]').each((i, el) => {
    const genre = $(el).text().trim();
    if (genre && !result.genres.includes(genre)) result.genres.push(genre);
  });
  result.genres = result.genres.slice(0, 6);

  const yearMatch = result.title.match(/\((\d{4})\)/) || $('.date, .year, .Year').first().text().match(/(\d{4})/);
  if (yearMatch) result.year = yearMatch[1];

  if (isSeries) {
    const seasonsMap = new Map();
    $('.Wdgtlet.season, [class*="temporada"]').each((i, el) => {
      const $sec = $(el);
      const textMatch = ($sec.find('.Title, h2, h3').text() || '').match(/(\d+)/);
      const sn = textMatch ? parseInt(textMatch[1]) : i + 1;

      const eps = [];
      $sec.find('a[href*="/episodio/"], li a').each((j, epEl) => {
        const epHref = $(epEl).attr('href');
        if (!epHref) return;
        const epUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
        const epNumMatch = epHref.match(/(?:episodio|capitulo|-1x)[/-]?(\d+)/i) || $(epEl).text().match(/(\d+)/);
        const epNum = epNumMatch ? parseInt(epNumMatch[1]) : j + 1;
        eps.push({ number: epNum, title: $(epEl).text().trim() || `Episodio ${epNum}`, url: epUrl });
      });
      if(eps.length > 0) seasonsMap.set(sn, eps);
    });
    
    result.seasons = Array.from(seasonsMap.entries())
      .sort((a,b) => a[0] - b[0])
      .map(([num, episodes]) => ({ number: num, episodes: episodes.sort((a,b) => a.number - b.number) }));
  }

  if (!isSeries || result.seasons.length === 0) extractServers($, html, result);
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
  // Try parsing data from script tags (Cuevana uses dynamic scripts often)
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

  // Extract from iframes
  $('iframe').each((i, el) => {
    let src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src.startsWith('//')) src = 'https:' + src;
    if (src && utils.isVideoUrl(src) && !result.servers.find(s => s.embedUrl === src)) {
        result.servers.push({ name: utils.extractServerName(src), embedUrl: src });
    }
  });

  // TPlayer attributes
  $('.TPlayerTb iframe, .TPlayer iframe').each((i, el) => {
    let src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src.startsWith('//')) src = 'https:' + src;
    if (src && !result.servers.find(s => s.embedUrl === src)) {
        result.servers.push({ name: 'CuevanaPlayer', embedUrl: src });
    }
  });
}

module.exports = { getLatest, getLatestSeries, search, getDetail, getEpisodeServers, setBaseUrl };
