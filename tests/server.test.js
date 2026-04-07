/**
 * tests/server.test.js
 * Unit tests for server.js utility functions.
 * Run with: node tests/server.test.js
 * Requires Node.js >= 18 (uses node:test built-in).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Import only the pure utility functions (no HTTP side effect at require-time
// because we re-export them at the bottom of server.js)
const {
  sanitizeQuery,
  sanitizeSource,
  sanitizeType,
  getCached,
  setCache,
  cache,
  CACHE_TTL,
} = require('../server.js');

// ─── sanitizeQuery ──────────────────────────────────────────────────────────

describe('sanitizeQuery', () => {
  test('returns a normal query unchanged', () => {
    assert.equal(sanitizeQuery('avengers endgame'), 'avengers endgame');
  });

  test('trims leading/trailing whitespace', () => {
    assert.equal(sanitizeQuery('  batman  '), 'batman');
  });

  test('truncates to 200 characters', () => {
    const long = 'a'.repeat(300);
    assert.equal(sanitizeQuery(long).length, 200);
  });

  test('strips dangerous characters < > " \' ` ; \\ { } | ^ [ ]', () => {
    const malicious = '<script>alert("xss")</script>';
    const result = sanitizeQuery(malicious);
    assert.ok(!result.includes('<'));
    assert.ok(!result.includes('>'));
    assert.ok(!result.includes('"'));
  });

  test('returns empty string for non-string input', () => {
    assert.equal(sanitizeQuery(null), '');
    assert.equal(sanitizeQuery(undefined), '');
    assert.equal(sanitizeQuery(123), '');
  });

  test('returns empty string for empty input', () => {
    assert.equal(sanitizeQuery(''), '');
    assert.equal(sanitizeQuery('   '), '');
  });

  test('preserves accented characters (movie titles in Spanish)', () => {
    const query = 'El señor de los anillos';
    assert.equal(sanitizeQuery(query), query);
  });
});

// ─── sanitizeSource ──────────────────────────────────────────────────────────

describe('sanitizeSource', () => {
  test('returns valid sources unchanged', () => {
    assert.equal(sanitizeSource('pelisplus'), 'pelisplus');
    assert.equal(sanitizeSource('poseidon'), 'poseidon');
    assert.equal(sanitizeSource('pelisplus_la'), 'pelisplus_la');
    assert.equal(sanitizeSource('cuevana'), 'cuevana');
    assert.equal(sanitizeSource('all'), 'all');
  });

  test('falls back to "all" for unknown sources', () => {
    assert.equal(sanitizeSource('evil_scraper'), 'all');
    assert.equal(sanitizeSource(''), 'all');
    assert.equal(sanitizeSource(null), 'all');
    assert.equal(sanitizeSource('../../../etc/passwd'), 'all');
  });

  test('is case-insensitive', () => {
    assert.equal(sanitizeSource('PELISPLUS'), 'pelisplus');
    assert.equal(sanitizeSource('All'), 'all');
  });
});

// ─── sanitizeType ────────────────────────────────────────────────────────────

describe('sanitizeType', () => {
  test('returns valid types unchanged', () => {
    assert.equal(sanitizeType('movies'), 'movies');
    assert.equal(sanitizeType('series'), 'series');
    assert.equal(sanitizeType('all'), 'all');
  });

  test('falls back to "all" for invalid types', () => {
    assert.equal(sanitizeType('anime'), 'all');
    assert.equal(sanitizeType(''), 'all');
    assert.equal(sanitizeType(undefined), 'all');
  });
});

// ─── Cache ───────────────────────────────────────────────────────────────────

describe('Cache (getCached / setCache)', () => {
  test('stores and retrieves data', () => {
    setCache('test:key', { movies: ['A', 'B'] }, CACHE_TTL.HOME);
    const result = getCached('test:key');
    assert.deepEqual(result, { movies: ['A', 'B'] });
  });

  test('returns null for non-existent keys', () => {
    assert.equal(getCached('nonexistent:key:12345'), null);
  });

  test('returns null for expired entries', () => {
    // Set a cache entry with TTL of 1 millisecond
    setCache('test:expired', 'should-expire', 1);
    // Wait 5ms to ensure it has expired
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    assert.equal(getCached('test:expired'), null);
  });

  test('cache TTL values are correct', () => {
    assert.equal(CACHE_TTL.HOME,    30 * 60 * 1000, 'HOME TTL should be 30 minutes');
    assert.equal(CACHE_TTL.SEARCH,  30 * 60 * 1000, 'SEARCH TTL should be 30 minutes');
    assert.equal(CACHE_TTL.DETAIL,  60 * 60 * 1000, 'DETAIL TTL should be 60 minutes');
    assert.equal(CACHE_TTL.EPISODE, 60 * 60 * 1000, 'EPISODE TTL should be 60 minutes');
  });

  test('separate cache keys do not collide', () => {
    setCache('home:pelisplus:movies:1', ['movie1'], CACHE_TTL.HOME);
    setCache('home:poseidon:movies:1', ['movie2'], CACHE_TTL.HOME);
    assert.deepEqual(getCached('home:pelisplus:movies:1'), ['movie1']);
    assert.deepEqual(getCached('home:poseidon:movies:1'), ['movie2']);
  });
});
