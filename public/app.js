// ==================== PelisStream Frontend ====================

// ─── Platform detection ─────────────────────────────────────────
// IS_NATIVE = true  → running inside a Capacitor APK (Android / TV)
//                     → uses browser-side scraper.js (no server needed)
// IS_NATIVE = false → running in a normal browser with Node.js server
//                     → uses /api/* endpoints
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// --- Native UX Helpers ---
const NativeUX = {
  async setImmersive(enabled) {
    if (enabled) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(e => console.error(e));
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(e => console.error(e));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    if (!IS_NATIVE) return;
    try {
      const { StatusBar } = window.Capacitor.Plugins;
      if (StatusBar) {
        if (enabled) await StatusBar.hide();
        else await StatusBar.show();
      }
    } catch (e) { console.error('StatusBar error', e); }
  }
};

// ─── DataSource: unified API for both modes ──────────────────────
const DataSource = {
  async getHome(source, type, page) {
    if (IS_NATIVE) {
      let items = [];
      const fn = type === 'series' ? 'getLatestSeries' : 'getLatest';
      if (source === 'pelisplus' || source === 'all') {
        try { items.push(...(await SCRAPERS.pelisplus[fn](page))); } catch(e) { console.error('PP home', e); }
      }
      if (source === 'poseidon' || source === 'all') {
        try { items.push(...(await SCRAPERS.poseidon[fn](page))); } catch(e) { console.error('POS home', e); }
      }
      if (source === 'pelisplus_la' || source === 'all') {
        try { items.push(...(await SCRAPERS.pelisplus_la[fn](page))); } catch(e) { console.error('PP_LA home', e); }
      }
      if (source === 'cuevana' || source === 'all') {
        try { items.push(...(await SCRAPERS.cuevana[fn](page))); } catch(e) { console.error('CUE home', e); }
      }
      return { success: true, items };
    }
    const res = await fetch(`/api/home?source=${source}&type=${type}&page=${page}`);
    return res.json();
  },

  async search(query, source, type) {
    if (IS_NATIVE) {
      let items = [];
      if (source === 'pelisplus' || source === 'all') {
        try { items.push(...(await SCRAPERS.pelisplus.search(query))); } catch(e) {}
      }
      if (source === 'poseidon' || source === 'all') {
        try { items.push(...(await SCRAPERS.poseidon.search(query))); } catch(e) {}
      }
      if (source === 'pelisplus_la' || source === 'all') {
        try { items.push(...(await SCRAPERS.pelisplus_la.search(query))); } catch(e) {}
      }
      if (source === 'cuevana' || source === 'all') {
        try { items.push(...(await SCRAPERS.cuevana.search(query))); } catch(e) {}
      }
      if (type === 'movies') items = items.filter(i => i.type !== 'series');
      if (type === 'series') items = items.filter(i => i.type === 'series');
      return { success: true, items };
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&source=${source}&type=${type}`);
    return res.json();
  },

  async getDetail(url, source) {
    if (IS_NATIVE) {
      let scraper = SCRAPERS.pelisplus;
      if (source === 'poseidon' || url.includes('poseidon')) scraper = SCRAPERS.poseidon;
      else if (source === 'pelisplus_la' || url.includes('pelisplushd.la')) scraper = SCRAPERS.pelisplus_la;
      else if (source === 'cuevana' || url.includes('cuevana')) scraper = SCRAPERS.cuevana;
      const detail  = await scraper.getDetail(url);
      return { success: !!detail, detail };
    }
    const res = await fetch(`/api/detail?url=${encodeURIComponent(url)}&source=${source}`);
    return res.json();
  },

  async getEpisodeServers(url, source) {
    if (IS_NATIVE) {
      let scraper = SCRAPERS.pelisplus;
      if (source === 'poseidon' || url.includes('poseidon')) scraper = SCRAPERS.poseidon;
      else if (source === 'pelisplus_la' || url.includes('pelisplushd.la')) scraper = SCRAPERS.pelisplus_la;
      else if (source === 'cuevana' || url.includes('cuevana')) scraper = SCRAPERS.cuevana;
      const servers  = await scraper.getEpisodeServers(url);
      return { success: true, servers };
    }
    const res = await fetch(`/api/episodes?url=${encodeURIComponent(url)}&source=${source}`);
    return res.json();
  }
};

// ─── State ───────────────────────────────────────────────────────
let currentSource = 'pelisplus';
let currentType   = 'movies';
let currentPage   = 1;
let searchTimeout = null;
let isLoadingMore = false;

// In-memory movie store (safe alternative to inlining JSON in onclick)
const movieStore = [];

// ─── History State ───────────────────────────────────────────────
const HISTORY_KEY = 'pelisstream_history';
let watchHistory = [];

try {
  const stored = localStorage.getItem(HISTORY_KEY);
  if (stored) watchHistory = JSON.parse(stored);
} catch (e) {
  console.error('Failed to load history:', e);
}

function saveToHistory(movie, epInfo) {
  try {
    if (!movie || !movie.url) return;
    
    console.log('Saving to history:', movie.title, epInfo);
    
    let item = JSON.parse(JSON.stringify(movie)); // Deep copy
    if (epInfo) item.lastWatched = epInfo;
    
    // Remove if already exists to move it to the front
    watchHistory = watchHistory.filter(m => m.url !== item.url);
    // Add to beginning
    watchHistory.unshift(item);
    // Limit to 50 items
    if (watchHistory.length > 50) watchHistory.pop();
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(watchHistory));
    console.log('History updated, count:', watchHistory.length);
    renderHistory(); // Update UI
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

window.clearAppHistory = function() {
  if (confirm('¿Borrar todo el historial de vistos?')) {
    watchHistory = [];
    localStorage.removeItem(HISTORY_KEY);
    if (currentType === 'history') {
        renderFullHistory();
    } else {
        renderHistory();
    }
  }
};

// ─── Helper for source names ─────────────────────────────────────
function formatSourceName(source) {
  if (!source) return 'Desconocido';
  if (source.toLowerCase() === 'pelisplus') return 'PelisPlus';
  if (source.toLowerCase() === 'poseidon') return 'PoseidonHD';
  if (source.toLowerCase() === 'pelisplus_la') return 'PelisPlus.la';
  if (source.toLowerCase() === 'cuevana') return 'Cuevana3';
  // Capitalize first letter for unknown sources
  return source.charAt(0).toUpperCase() + source.slice(1);
}

// ─── DOM refs ─────────────────────────────────────────────────────
const mainContent     = document.getElementById('mainContent');
const searchInput     = document.getElementById('searchInput');
const modalOverlay    = document.getElementById('modalOverlay');
const modal           = document.getElementById('modal');
const modalClose      = document.getElementById('modalClose');
const playerContainer = document.getElementById('playerContainer');
const playerPlaceholder = document.getElementById('playerPlaceholder');
const serverSection   = document.getElementById('serverSection');
const serverList      = document.getElementById('serverList');
const detailTitle     = document.getElementById('detailTitle');
const detailMeta      = document.getElementById('detailMeta');
const detailGenres    = document.getElementById('detailGenres');
const detailDescription = document.getElementById('detailDescription');
const detailLink      = document.getElementById('detailLink');
const playBig         = document.getElementById('playBig');

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  setupSourceTabs();
  setupNavTabs();
  setupSearch();
  setupModal();
  setupRefreshHome(); // Setup manual refresh
  
  // Refrescar pestañas en caso de que la config remota ya se haya procesado
  syncSourcesUI();

  loadHome();

  // Escuchar cuando el Remote Config termine de procesar en scraper.js
  window.addEventListener('configLoaded', () => {
    console.log('[PelisStream] Sincronizando UI con Remote Config...');
    syncSourcesUI();
  });
});

// Ocultar pestañas de scrapers desactivados desde el Gist
function syncSourcesUI() {
  const tabs = document.querySelectorAll('.source-tab');
  let firstVisible = null;
  let activeTabDisabled = false;

  tabs.forEach(tab => {
    const source = tab.dataset.source;
    if (source !== 'all' && SCRAPERS[source] && SCRAPERS[source].disabled) {
      tab.style.display = 'none';
      if (tab.classList.contains('active')) activeTabDisabled = true;
    } else {
      tab.style.display = 'block';
      if (!firstVisible) firstVisible = tab;
    }
  });

  // Si el scraper que el usuario estaba viendo se desactivó remotamente, cambiamos al primero disponible
  if (activeTabDisabled && firstVisible) {
    firstVisible.click();
  }
}

// ==================== SOURCE TABS ====================

function setupSourceTabs() {
  document.querySelectorAll('.source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSource = tab.dataset.source;
      currentPage   = 1;
      
      if (currentType === 'history') {
        // Switch back to movies if a source is clicked while in history
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const moviesTab = document.querySelector('.nav-tab[data-type="movies"]');
        if (moviesTab) moviesTab.classList.add('active');
        currentType = 'movies';
      }
      
      if (searchInput.value.trim()) doSearch(searchInput.value.trim());
      else loadHome();
    });
  });
}

// ==================== NAV TABS ====================

function setupNavTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
      currentPage = 1;
      
      if (currentType === 'history') {
        renderFullHistory();
      } else {
        if (searchInput.value.trim()) doSearch(searchInput.value.trim());
        else loadHome();
      }
    });
  });
}

// ==================== SEARCH ====================

function setupSearch() {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (!query) { currentPage = 1; loadHome(); return; }
    searchTimeout = setTimeout(() => doSearch(query), 600);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      if (q) doSearch(q);
    }
  });
}

async function doSearch(query) {
  showLoading(`Buscando "${query}"…`);
  try {
    let data = await DataSource.search(query, currentSource, currentType);
    
    if ((!data.success || !data.items || data.items.length === 0) && currentSource !== 'all') {
      showLoading(`Sin resultados en ${formatSourceName(currentSource)}. Buscando en todas las fuentes…`);
      data = await DataSource.search(query, 'all', currentType);
      
      if (data.success && data.items && data.items.length > 0) {
        renderMovies(data.items, `Resultados de otras fuentes para "${query}"`, false);
        return;
      }
    }

    if (data.success && data.items && data.items.length > 0) {
      renderMovies(data.items, `Resultados para "${query}"`, false);
    } else {
      showEmpty(`No se encontraron resultados para "${query}" en ninguna fuente`);
    }
  } catch (err) {
    console.error('Search error:', err);
    showEmpty('Error al buscar. Intenta de nuevo.');
  }
}

// ==================== HOME ====================

const CACHE_KEY_HOME = 'pelisstream_home_cache';

// Load cached data first (Stale-While-Revalidate)
function loadHomeFromCache(source, type) {
  try {
    const cached = localStorage.getItem(CACHE_KEY_HOME);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Only use cache if the parameters match exactly
      if (parsed.source === source && parsed.type === type && parsed.items) {
        return parsed.items;
      }
    }
  } catch (e) {}
  return null;
}

function saveHomeToCache(source, type, items) {
  try {
    const dataToSave = {
      source,
      type,
      items,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY_HOME, JSON.stringify(dataToSave));
  } catch (e) {}
}

async function loadHome(append = false, forceRefresh = false) {
  let initialItems = null;

  if (!append) { 
    currentPage = 1; 
    movieStore.length = 0; // Reset store
    
    // Check local storage for instant loading
    if (!forceRefresh) {
        initialItems = loadHomeFromCache(currentSource, currentType);
        if (initialItems && initialItems.length > 0) {
            const label = currentType === 'series' ? 'Últimas Series' : 'Últimas Películas';
            renderMovies(initialItems, label, false); // Render from cache
            renderHistory(); // Ensure history is rendered with cached UI
        } else {
            showSkeleton(); 
        }
    } else {
        showSkeleton();
    }
  }

  try {
    const data = await DataSource.getHome(currentSource, currentType, currentPage);
    if (data.success && data.items && data.items.length > 0) {
      const label = currentType === 'series' ? 'Últimas Series' : 'Últimas Películas';
      
      // If we loaded from cache, and the new data is identical to cache, we can skip re-rendering.
      // (Simplified check: just compare first item URLs. For a perfect check, stringify).
      let shouldRender = true;
      if (!append && initialItems && initialItems.length > 0 && data.items.length > 0) {
          if (initialItems[0].url === data.items[0].url) {
              shouldRender = false; // No new content at the top
          }
      }

      if (shouldRender || append) {
          renderMovies(data.items, label, append);
      }
      
      if (!append) {
          saveHomeToCache(currentSource, currentType, data.items);
      }
    } else {
      if (!append && !initialItems) showEmpty('No se encontró contenido. Intenta con otra fuente.');
      const btn = document.getElementById('loadMoreBtn');
      if (btn) btn.style.display = 'none';
    }
  } catch (err) {
    console.error('Home error:', err);
    if (!append && !initialItems) showEmpty('Error al cargar.');
  } finally {
    isLoadingMore = false;
    
    // --- OPTIMIZACIÓN PILLAR 2: Ocultar Splash Screen nativo ---
    // Solo lo ocultamos cuando la primera carga (sea de caché o red) ha terminado.
    if (!append) {
      setTimeout(() => {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen) {
          window.Capacitor.Plugins.SplashScreen.hide();
          console.log('[PelisStream] Splash Screen oculto tras carga inicial.');
        }
      }, 100);
    }
  }
}

function setupRefreshHome() {
    // We will attach this dynamically to the DOM when recreating mainContent
    window.refreshHomeManual = function() {
        loadHome(false, true); // Force refresh
    };
}

function goHome(e) {
  if (e) e.preventDefault();
  searchInput.value = '';
  currentPage = 1;
  currentType = 'movies';
  currentSource = 'pelisplus';
  
  // Reset UI Visuals
  document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
  const ppTab = document.querySelector('.source-tab[data-source="pelisplus"]');
  if (ppTab) ppTab.classList.add('active');

  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const moviesTab = document.querySelector('.nav-tab[data-type="movies"]');
  if (moviesTab) moviesTab.classList.add('active');

  loadHome();
}

// ==================== RENDER MOVIES ====================

function renderHistory() {
    const histContainer = document.getElementById('historyContainer');
    if (!histContainer) {
        console.log('History container not found in DOM');
        return;
    }

    if (!watchHistory || watchHistory.length === 0) {
        histContainer.style.display = 'none';
        histContainer.innerHTML = '';
        return;
    }

    histContainer.style.display = 'block';
    
    let html = `<div class="history-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                  <h2 class="section-title">🕒 Vistos Recientemente</h2>
                  <div style="display:flex; gap:10px;">
                    ${watchHistory.length > 3 ? `<button onclick="renderFullHistory()" style="background:transparent; border:none; color:#818cf8; cursor:pointer; font-size:14px;" title="Ver los 50 elementos">Ver todo</button>` : ''}
                    <button onclick="window.clearAppHistory()" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-size:14px;" title="Borrar historial">Limpiar</button>
                  </div>
                </div>`;
    html += '<div class="movie-grid history-grid">';
    
    // Only show top 3 items on home screen 
    const displayHistory = watchHistory.slice(0, 3);

    displayHistory.forEach((movie) => {
        if (!movie || !movie.title) return;
        
        // We use a safe way to store the data for the onclick
        const storeIndex = movieStore.length;
        movieStore.push(movie);
        
        const isSeries   = movie.type === 'series' || movie.type === 'anime';
        const typeLabel  = isSeries ? (movie.type === 'anime' ? 'Anime' : 'Serie') : '';
        const sourceName = formatSourceName(movie.source);
        const epLabel    = movie.lastWatched ? `<span class="card-year" style="color:#818cf8;border: 1px solid #818cf8;padding: 2px 5px;border-radius: 4px;font-size:10px;">${movie.lastWatched}</span>` : '';

        html += `
          <div class="movie-card" title="${escapeAttr(movie.title)}" onclick="openDetail(movieStore[${storeIndex}])">
            <div class="poster-wrapper">
              <img class="poster" src="${escapeAttr(movie.image)}" alt="${escapeAttr(movie.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%230d0d1f%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 x=%22100%22 y=%22150%22 text-anchor=%22middle%22 font-size=%2230%22%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E'">
              <span class="card-badge-source">${sourceName}</span>
              ${typeLabel ? `<span class="card-badge-type">${typeLabel}</span>` : ''}
              ${movie.lastWatched ? `<span class="card-badge-ep">${movie.lastWatched}</span>` : ''}
            </div>
            <div class="card-overlay">
              <div class="card-play">▶</div>
              <span class="card-title">${escapeHTML(movie.title)}</span>
              <div class="card-meta">
                ${epLabel}
                ${movie.year ? `<span class="card-year">${movie.year}</span>` : ''}
              </div>
            </div>
          </div>
        `;
    });
    html += '</div>';
    histContainer.innerHTML = html;
}

window.renderFullHistory = function() {
    movieStore.length = 0;
    
    let html = `
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
        <h2 class="section-title">🕒 Historial Completo</h2>
        <div style="display:flex; gap:10px;">
          <button onclick="window.clearAppHistory()" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-size:14px;" title="Borrar historial">Limpiar Todo</button>
        </div>
      </div>
    `;

    if (!watchHistory || watchHistory.length === 0) {
        html += '<div style="text-align:center; color:#888; margin-top:50px;">No has visto nada aún.</div>';
        mainContent.innerHTML = html;
        return;
    }

    html += '<div class="movie-grid" id="movieGrid"></div>';
    mainContent.innerHTML = html;
    
    // Render the 50 items
    const grid = document.getElementById('movieGrid');
    watchHistory.forEach((movie, i) => {
        if (!movie || !movie.title) return;
        const storeIndex = movieStore.length;
        movieStore.push(movie);
        const delay = Math.min(i * 0.04, 0.8);
        const typeLabel = movie.type === 'series' ? 'Serie' : movie.type === 'anime' ? 'Anime' : '';
        const sourceName = formatSourceName(movie.source);
        const epLabel = movie.lastWatched ? `<span class="card-year" style="color:#818cf8;border: 1px solid #818cf8;padding: 2px 5px;border-radius: 4px;">${movie.lastWatched}</span>` : '';
        
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.style.animationDelay = `${delay}s`;
        card.title = movie.title;
        card.dataset.index = storeIndex;
        card.addEventListener('click', () => openDetail(movieStore[storeIndex]));

        card.innerHTML = `
          <div class="poster-wrapper">
            <img class="poster" src="${escapeAttr(movie.image)}" alt="${escapeAttr(movie.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%230d0d1f%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 x=%22100%22 y=%22150%22 text-anchor=%22middle%22 font-size=%2230%22%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E'">
            <span class="card-badge-source">${sourceName}</span>
            ${typeLabel ? `<span class="card-badge-type">${typeLabel}</span>` : ''}
            ${movie.lastWatched ? `<span class="card-badge-ep">${movie.lastWatched}</span>` : ''}
          </div>
          <div class="card-overlay">
            <div class="card-play">▶</div>
            <span class="card-title">${escapeHTML(movie.title)}</span>
            <div class="card-meta">
              ${epLabel}
              ${movie.year ? `<span class="card-year">${movie.year}</span>` : ''}
            </div>
          </div>
          <div class="card-info">
            <div class="info-title">${escapeHTML(movie.title)}</div>
            <div class="info-meta">
              ${epLabel ? `<span class="info-year" style="color:#818cf8">${epLabel}</span>` : ''}
              <span class="info-source">${sourceName}</span>
            </div>
          </div>
        `;
        grid.appendChild(card);
    });
};

function renderMovies(movies, title, append = false) {
  if (!append) {
    movieStore.length = 0;
    
    // Base layout: History + Main Grid + Load More
    let html = `
      <div id="historyContainer" style="display:none; margin-bottom: 30px;"></div>
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h2 class="section-title">${escapeHTML(title)}</h2>
        <button onclick="window.refreshHomeManual()" style="background:transparent; border:none; color:#a1a1aa; cursor:pointer; font-size:14px; padding:5px; border-radius:4px;" title="Actualizar contenido">🔄 Refrescar</button>
      </div>
    `;
    html += '<div class="movie-grid" id="movieGrid"></div>';
    html += `<div class="load-more-container">
      <button id="loadMoreBtn" class="load-more-btn" onclick="loadMoreHome()">
        <span id="loadMoreText">Cargar más</span>
      </button>
    </div>`;
    
    mainContent.innerHTML = html;
    
    // Render history immediately if it's a fresh render
    renderHistory();
  }

  const grid = document.getElementById('movieGrid');
  if (!grid) return;

  movies.forEach((movie, i) => {
    const storeIndex = movieStore.length;
    movieStore.push(movie);

    const delay      = Math.min(i * 0.04, 0.8);
    const typeLabel  = movie.type === 'series' ? 'Serie' : movie.type === 'anime' ? 'Anime' : '';
    const sourceName = formatSourceName(movie.source);

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.style.animationDelay = `${delay}s`;
    card.title    = movie.title;
    card.dataset.index = storeIndex;
    card.addEventListener('click', () => openDetail(movieStore[storeIndex]));

    card.innerHTML = `
      <div class="poster-wrapper">
        <img class="poster" src="${escapeAttr(movie.image)}" alt="${escapeAttr(movie.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22%3E%3Crect fill=%22%230d0d1f%22 width=%22200%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 x=%22100%22 y=%22150%22 text-anchor=%22middle%22 font-size=%2230%22%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E'">
        <span class="card-badge-source">${sourceName}</span>
        ${typeLabel ? `<span class="card-badge-type">${typeLabel}</span>` : ''}
        ${movie.lastWatched ? `<span class="card-badge-ep">${movie.lastWatched}</span>` : ''}
      </div>
      <div class="card-overlay">
        <div class="card-play">▶</div>
        <span class="card-title">${escapeHTML(movie.title)}</span>
        <div class="card-meta">
          ${movie.year   ? `<span class="card-year">${movie.year}</span>` : ''}
          ${movie.rating ? `<span class="card-rating">⭐ ${movie.rating}</span>` : ''}
        </div>
      </div>
      <div class="card-info">
        <div class="info-title">${escapeHTML(movie.title)}</div>
        <div class="info-meta">
          ${movie.year ? `<span class="info-year">${movie.year}</span>` : ''}
          <span class="info-source">${sourceName}</span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function loadMoreHome() {
  if (isLoadingMore) return;
  isLoadingMore = true;
  const btn = document.getElementById('loadMoreBtn');
  const txt = document.getElementById('loadMoreText');
  if (btn) { btn.disabled = true; if (txt) txt.textContent = 'Cargando…'; }
  currentPage++;
  await loadHome(true);
  if (btn) { btn.disabled = false; if (txt) txt.textContent = 'Cargar más'; }
}

// ==================== MOVIE DETAIL / MODAL ====================

function setupModal() {
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  
  // Soporte teclado/D-Pad para Android TV en play button
  if (playBig) {
    playBig.setAttribute('tabindex', '0');
    playBig.addEventListener('keydown', (e) => { if (e.key === 'Enter') playBig.click(); });
  }

  // Backbutton universal (funciona con o sin Capacitor)
  document.addEventListener('backbutton', () => {
    if (modalOverlay.classList.contains('active')) closeModal();
  }, false);

  // Capacitor nativo
  if (IS_NATIVE) {
    const initAppBackButton = () => {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
          if (modalOverlay.classList.contains('active')) {
            closeModal();
          } else if (searchInput.value.trim() !== '' || currentType !== 'movies' || currentSource !== 'pelisplus') {
            goHome(new Event('click'));
          } else {
            window.Capacitor.Plugins.App.exitApp();
          }
        });
      } else {
        setTimeout(initAppBackButton, 100);
      }
    };
    initAppBackButton();
  }
}

async function openDetail(movie) {
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  detailTitle.textContent = movie.title || 'Cargando…';
  detailMeta.innerHTML    = '';
  detailGenres.innerHTML  = '';
  detailDescription.textContent = 'Cargando información…';
  detailLink.href         = movie.url;
  detailLink.style.display = 'inline-flex';
  serverSection.style.display = 'none';
  serverList.innerHTML = '';

  const prevEpSel = document.getElementById('episodeSelector');
  if (prevEpSel) prevEpSel.remove();

  clearPlayer();
  showModalLoading(true);

  try {
    const data = await DataSource.getDetail(movie.url, movie.source);

    if (data.success && data.detail) {
      const d = data.detail;
      detailTitle.textContent = d.title || movie.title;

      let metaHTML = '';
      if (d.year) metaHTML += `<span class="meta-item year">📅 ${d.year}</span>`;
      metaHTML += `<span class="meta-item">📡 ${formatSourceName(d.source)}</span>`;
      if (d.type === 'series') metaHTML += `<span class="meta-item">📺 Serie</span>`;
      detailMeta.innerHTML = metaHTML;

      if (d.genres && d.genres.length > 0) {
        detailGenres.innerHTML = d.genres.map(g => `<span class="genre-tag">${escapeHTML(g)}</span>`).join('');
      }

      detailDescription.textContent = d.description || 'Sin descripción disponible.';
      detailLink.href = d.url || movie.url;

      if (d.type === 'series' && d.seasons && d.seasons.length > 0) {
        showEpisodeSelector(d.seasons, d.source || movie.source, movie);
      } else if (d.servers && d.servers.length > 0) {
        serverSection.style.display = 'block';
        renderServers(d.servers, movie);
        playBig.onclick = () => { playServer(d.servers[0].embedUrl); saveToHistory(movie); };
      } else {
        serverSection.style.display = 'block';
        renderFallbackServers(movie.url, movie);
        playBig.onclick = () => { playServer('/api/proxy?url=' + encodeURIComponent(movie.url)); saveToHistory(movie); };
      }
    } else {
      detailDescription.textContent = 'No se pudo cargar la información.';
      serverSection.style.display = 'block';
      renderFallbackServers(movie.url, movie);
      playBig.onclick = () => { playServer('/api/proxy?url=' + encodeURIComponent(movie.url)); saveToHistory(movie); };
    }
  } catch (err) {
    console.error('Detail error:', err);
    detailDescription.textContent = 'Error al cargar detalles.';
  } finally {
    showModalLoading(false);
    // Autofocus inteligente para Android TV: Meter el foco DENTO del área escroleable
    setTimeout(() => { 
      // Forzamos un pequeño scroll visual para que se note que hay contenido abajo en TVs 720p
      const scrollArea = document.querySelector('.modal-content-scroll');
      if (scrollArea) scrollArea.scrollTop = 180;

      const firstTarget = document.querySelector('#modal .server-btn, #modal .season-tab, #modal .episode-btn');
      if (firstTarget && typeof firstTarget.focus === 'function') {
        firstTarget.focus();
      } else if (playBig && typeof playBig.focus === 'function') {
        playBig.focus();
      }
    }, 300);
  }
}

// ==================== EPISODE SELECTOR ====================

function showEpisodeSelector(seasons, source, baseMovie) {
  const container = document.createElement('div');
  container.id        = 'episodeSelector';
  container.className = 'episode-selector';

  const seasonTabsHtml = seasons.map((s, i) =>
    `<button class="season-tab ${i === 0 ? 'active' : ''}" data-season="${i}">T${s.number}</button>`
  ).join('');

  container.innerHTML = `
    <div class="season-tabs-wrapper">
      <div class="season-label">📺 Temporadas</div>
      <div class="season-tabs" id="seasonTabs">${seasonTabsHtml}</div>
    </div>
    <div class="episodes-list" id="episodesList"></div>
  `;

  serverSection.parentNode.insertBefore(container, serverSection);
  renderEpisodeList(seasons[0].episodes, source, baseMovie, seasons[0].number);

  container.querySelectorAll('.season-tab').forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderEpisodeList(seasons[idx].episodes, source, baseMovie, seasons[idx].number);
    });
  });
}

function renderEpisodeList(episodes, source, baseMovie, seasonNumber) {
  const list = document.getElementById('episodesList');
  if (!list) return;
  list.innerHTML = '';

  episodes.forEach(ep => {
    const btn = document.createElement('button');
    btn.className = 'episode-btn';
    btn.innerHTML = `<span class="ep-number">EP ${ep.number}</span><span class="ep-title">${escapeHTML(ep.title)}</span>`;
    btn.addEventListener('click', () => loadEpisodeServers(ep, source, btn, baseMovie, seasonNumber));
    list.appendChild(btn);
  });
}

async function loadEpisodeServers(episode, source, clickedBtn, baseMovie, seasonNumber) {
  document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
  clickedBtn.classList.add('active');
  clearPlayer();
  serverSection.style.display = 'block';
  serverList.innerHTML = '<span style="color:#888;font-size:13px;">Buscando servidores…</span>';

  const epInfo = `T${seasonNumber || 1} E${episode.number}`;

  try {
    const data = await DataSource.getEpisodeServers(episode.url, source);
    if (data.success && data.servers && data.servers.length > 0) {
      renderServers(data.servers, baseMovie, epInfo);
      playBig.onclick = () => { playServer(data.servers[0].embedUrl); if(baseMovie) saveToHistory(baseMovie, epInfo); };
    } else {
      renderFallbackServers(episode.url, baseMovie, epInfo);
      playBig.onclick = () => { playServer('/api/proxy?url=' + encodeURIComponent(episode.url)); if(baseMovie) saveToHistory(baseMovie, epInfo); };
    }
  } catch (err) {
    console.error('Episode error:', err);
    renderFallbackServers(episode.url, baseMovie, epInfo);
  }
}

// ==================== SERVER RENDERING ====================

function renderServers(servers, baseMovie, epInfo) {
  serverList.innerHTML = '';
  servers.forEach((server, i) => {
    const btn = document.createElement('button');
    btn.className = 'server-btn' + (i === 0 ? ' active' : '');
    btn.textContent = server.name || `Servidor ${i + 1}`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playServer(server.embedUrl);
      if(baseMovie) saveToHistory(baseMovie, epInfo);
    });
    serverList.appendChild(btn);
  });

  const origBtn = document.createElement('button');
  origBtn.className   = 'server-btn';
  origBtn.textContent = '🌐 Página original';
  origBtn.addEventListener('click', () => {
    document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
    origBtn.classList.add('active');
    playServer('/api/proxy?url=' + encodeURIComponent(detailLink.href));
    if(baseMovie) saveToHistory(baseMovie, epInfo);
  });
  serverList.appendChild(origBtn);
}

function renderFallbackServers(url, baseMovie, epInfo) {
  const btn = document.createElement('button');
  btn.className = 'server-btn';
  btn.textContent = '🌐 Abrir reproductor original';
  btn.addEventListener('click', () => {
    playServer('/api/proxy?url=' + encodeURIComponent(url));
    if (baseMovie) saveToHistory(baseMovie, epInfo);
  });

  const a = document.createElement('a');
  a.className = 'server-btn';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = '🔗 Abrir en nueva pestaña';

  serverList.innerHTML = '';
  serverList.appendChild(btn);
  serverList.appendChild(a);
}

// ==================== PLAYER ====================

function playServer(embedUrl) {
  NativeUX.setImmersive(true); // Entrar en modo inmersivo (ocultar status bar)
  playerPlaceholder.style.display = 'none';
  let src = embedUrl;
  if (!src.startsWith('/api/proxy') && !src.startsWith('http')) src = 'https:' + src;

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
  iframe.style.cssText = 'width:100%;height:100%;border:none;';

  const existing = playerContainer.querySelector('iframe');
  if (existing) existing.remove();
  playerContainer.appendChild(iframe);
}

function clearPlayer() {
  const iframe = playerContainer.querySelector('iframe');
  if (iframe) iframe.remove();
  playerPlaceholder.style.display = 'flex';
}

function closeModal() {
  NativeUX.setImmersive(false); // Salir de modo inmersivo
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
  const iframe = playerContainer.querySelector('iframe');
  if (iframe) iframe.src = 'about:blank';
  setTimeout(clearPlayer, 300);
}

// ==================== MODAL LOADING ====================

function showModalLoading(show) {
  let spinner = document.getElementById('modalSpinner');
  if (show) {
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'modalSpinner';
      spinner.style.cssText = 'display:flex;align-items:center;gap:10px;color:#aaa;font-size:14px;margin:8px 0;';
      spinner.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div><span>Buscando información…</span>';
      detailMeta.insertAdjacentElement('afterend', spinner);
    }
    spinner.style.display = 'flex';
  } else {
    if (spinner) spinner.style.display = 'none';
  }
}

// ==================== UI HELPERS ====================

function showLoading(text) {
  mainContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span class="loading-text">${escapeHTML(text || 'Cargando…')}</span>
    </div>`;
}

function showSkeleton() {
  let html = '<div class="skeleton-grid">';
  for (let i = 0; i < 12; i++) {
    html += `<div class="skeleton-card">
      <div class="skeleton-poster"></div>
      <div class="skeleton-info">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>`;
  }
  mainContent.innerHTML = html + '</div>';
}

function showEmpty(msg) {
  mainContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">${escapeHTML(msg)}</span>
    </div>`;
}

// ==================== UTILS ====================

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
