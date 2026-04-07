/**
 * tests/scrapers.test.js
 * Smoke / contract tests for the server-side scrapers.
 * These tests verify that each scraper module exports the expected API
 * and returns data in the correct shape — WITHOUT making real network calls
 * (axios is mocked to return a minimal HTML fixture).
 *
 * Run with: node tests/scrapers.test.js
 * Requires Node.js >= 18 (uses node:test built-in).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const Module = require('module');

// ─── Minimal HTML fixtures ────────────────────────────────────────────────────
// A tiny but valid HTML page that each scraper will parse.
// It contains one movie card matching each scraper's CSS selectors.

const MOVIE_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Movie - Pelisplus</title>
  <meta property="og:image" content="https://example.com/poster.jpg">
  <meta property="og:description" content="Una película de prueba.">
</head>
<body>
  <article class="item">
    <a href="/pelicula/test-movie-2024" title="Test Movie">
      <img src="https://example.com/poster.jpg" alt="Test Movie">
      <h2>Test Movie</h2>
    </a>
    <span class="year">2024</span>
  </article>
</body>
</html>
`;

const SERIES_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Series</title>
  <meta property="og:image" content="https://example.com/series.jpg">
</head>
<body>
  <article class="item">
    <a href="/serie/test-series-2024" title="Test Series">
      <img src="https://example.com/series.jpg" alt="Test Series">
      <h2>Test Series</h2>
    </a>
  </article>
</body>
</html>
`;

const DETAIL_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:image" content="https://example.com/poster.jpg">
  <meta property="og:description" content="Descripción de la película.">
</head>
<body>
  <h1>Test Movie Detail</h1>
  <span class="year">2024</span>
  <a href="/generos/accion">Acción</a>
  <iframe src="https://streamwish.com/embed/abc123"></iframe>
</body>
</html>
`;

// ─── Axios mock ───────────────────────────────────────────────────────────────
// We intercept require('axios') at the Module level so the scraper files
// get the mock instead of the real axios — no network calls are made.

const mockAxios = {
  get: async (url) => ({
    data: url.includes('/serie') ? SERIES_FIXTURE : MOVIE_FIXTURE,
    headers: { 'content-type': 'text/html' },
    status: 200,
  }),
};

// Save original Module._resolveFilename and patch only 'axios'
const _originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'axios') return mockAxios;
  return _originalLoad.apply(this, arguments);
};

// Now load the scrapers (they will get the mocked axios)
const pelisplus   = require('../scrapers/pelisplus');
const poseidon    = require('../scrapers/poseidon');
const pelisplus_la = require('../scrapers/pelisplus_la');
const cuevana     = require('../scrapers/cuevana');

// Restore Module._load after requires so other things aren't affected
Module._load = _originalLoad;

// ─── Contract shape helper ────────────────────────────────────────────────────

/**
 * Asserts that an item returned by getLatest() / search() has the expected fields.
 */
function assertItemShape(item, context) {
  assert.ok(typeof item.title   === 'string', `${context}: title should be a string`);
  assert.ok(item.title.length   >  0,         `${context}: title should not be empty`);
  assert.ok(typeof item.url     === 'string', `${context}: url should be a string`);
  assert.ok(item.url.length     >  0,         `${context}: url should not be empty`);
  assert.ok(typeof item.image   === 'string', `${context}: image should be a string`);
  assert.ok(['movie','series','anime'].includes(item.type), `${context}: type should be movie/series/anime, got "${item.type}"`);
  assert.ok(typeof item.source  === 'string', `${context}: source should be a string`);
}

/**
 * Asserts that a detail object has the expected contract shape.
 */
function assertDetailShape(detail, context) {
  assert.ok(detail !== null,                              `${context}: detail should not be null`);
  assert.ok(typeof detail.title       === 'string',       `${context}: detail.title should be a string`);
  assert.ok(Array.isArray(detail.servers),                `${context}: detail.servers should be an array`);
  assert.ok(Array.isArray(detail.seasons),                `${context}: detail.seasons should be an array`);
  assert.ok(Array.isArray(detail.genres),                 `${context}: detail.genres should be an array`);
  assert.ok(['movie','series','anime'].includes(detail.type), `${context}: detail.type invalid`);
}

// ─── Module exports test ──────────────────────────────────────────────────────

describe('Scraper module exports', () => {
  const scrapers = { pelisplus, poseidon, pelisplus_la, cuevana };
  const requiredMethods = ['getLatest', 'getLatestSeries', 'search', 'getDetail', 'getEpisodeServers', 'setBaseUrl'];

  for (const [name, scraper] of Object.entries(scrapers)) {
    test(`${name} exports all required methods`, () => {
      for (const method of requiredMethods) {
        assert.ok(
          typeof scraper[method] === 'function',
          `${name}.${method} should be a function but got ${typeof scraper[method]}`
        );
      }
    });
  }
});

// ─── pelisplus ────────────────────────────────────────────────────────────────

describe('pelisplus scraper', () => {
  test('setBaseUrl accepts a URL without throwing', () => {
    assert.doesNotThrow(() => pelisplus.setBaseUrl('https://pelisplushd.bz'));
  });

  test('getLatest() returns an array', async () => {
    const items = await pelisplus.getLatest(1);
    assert.ok(Array.isArray(items), 'getLatest should return an array');
  });

  test('getLatest() items have the correct shape', async () => {
    const items = await pelisplus.getLatest(1);
    for (const item of items) assertItemShape(item, 'pelisplus.getLatest');
  });

  test('getLatestSeries() returns an array', async () => {
    const items = await pelisplus.getLatestSeries(1);
    assert.ok(Array.isArray(items));
  });

  test('search() returns an array', async () => {
    const items = await pelisplus.search('batman');
    assert.ok(Array.isArray(items));
  });

  test('getDetail() returns an object with correct shape', async () => {
    const detail = await pelisplus.getDetail('https://pelisplushd.bz/pelicula/test-movie-2024');
    assertDetailShape(detail, 'pelisplus.getDetail');
  });

  test('getEpisodeServers() returns an array', async () => {
    const servers = await pelisplus.getEpisodeServers('https://pelisplushd.bz/pelicula/test-episode-1');
    assert.ok(Array.isArray(servers));
  });
});

// ─── poseidon ─────────────────────────────────────────────────────────────────

describe('poseidon scraper', () => {
  test('setBaseUrl accepts a URL without throwing', () => {
    assert.doesNotThrow(() => poseidon.setBaseUrl('https://poseidonhd2.co'));
  });

  test('getLatest() returns an array', async () => {
    const items = await poseidon.getLatest(1);
    assert.ok(Array.isArray(items));
  });

  test('getLatestSeries() returns an array', async () => {
    const items = await poseidon.getLatestSeries(1);
    assert.ok(Array.isArray(items));
  });

  test('search() returns an array', async () => {
    const items = await poseidon.search('spider');
    assert.ok(Array.isArray(items));
  });

  test('getDetail() returns correct shape', async () => {
    const detail = await poseidon.getDetail('https://poseidonhd2.co/pelicula/test-2024');
    assertDetailShape(detail, 'poseidon.getDetail');
  });

  test('getEpisodeServers() returns an array', async () => {
    const servers = await poseidon.getEpisodeServers('https://poseidonhd2.co/pelicula/ep1');
    assert.ok(Array.isArray(servers));
  });
});

// ─── pelisplus_la ─────────────────────────────────────────────────────────────

describe('pelisplus_la scraper', () => {
  test('setBaseUrl accepts a URL without throwing', () => {
    assert.doesNotThrow(() => pelisplus_la.setBaseUrl('https://pelisplushd.la'));
  });

  test('getLatest() returns an array', async () => {
    const items = await pelisplus_la.getLatest(1);
    assert.ok(Array.isArray(items));
  });

  test('search() returns an array', async () => {
    const items = await pelisplus_la.search('iron man');
    assert.ok(Array.isArray(items));
  });

  test('getDetail() returns correct shape', async () => {
    const detail = await pelisplus_la.getDetail('https://pelisplushd.la/pelicula/test-2024');
    assertDetailShape(detail, 'pelisplus_la.getDetail');
  });
});

// ─── cuevana ──────────────────────────────────────────────────────────────────

describe('cuevana scraper', () => {
  test('setBaseUrl accepts a URL without throwing', () => {
    assert.doesNotThrow(() => cuevana.setBaseUrl('https://cuevana3.to'));
  });

  test('getLatest() returns an array', async () => {
    const items = await cuevana.getLatest(1);
    assert.ok(Array.isArray(items));
  });

  test('search() returns an array', async () => {
    const items = await cuevana.search('thor');
    assert.ok(Array.isArray(items));
  });

  test('getDetail() returns correct shape', async () => {
    const detail = await cuevana.getDetail('https://cuevana3.to/pelicula/test-2024');
    assertDetailShape(detail, 'cuevana.getDetail');
  });
});
