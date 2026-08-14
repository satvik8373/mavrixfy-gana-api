/**
 * ytmusicapi Testing Hub & API Explorer - Frontend Logic
 */

// Application State
const state = {
  activeTab: 'home',
  methods: [],
  categories: [],
  selectedMethod: null,
  currentCategory: 'all',
  searchQuery: '',
  searchFilter: 'all',
  currentPlayingTrack: null,
  authStatus: {
    authenticated: false,
    auth_type: 'UNAUTHORIZED',
    language: 'en',
    location: '',
  },
};

// Lucide icon helper
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info'}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// Copy JSON helper
function copyJson(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied JSON to clipboard!', 'success');
  }).catch(err => {
    showToast('Failed to copy: ' + err, 'error');
  });
}

// Tab Navigation
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger data loads if first time or empty
  if (tabId === 'home') {
    const chartsGrid = document.getElementById('charts-grid');
    if (!chartsGrid.children.length) loadCharts();
    const homeShelves = document.getElementById('home-shelves-container');
    if (!homeShelves.children.length) loadHomeFeed();
  } else if (tabId === 'search') {
    const searchGrid = document.getElementById('search-results-grid');
    if (!searchGrid.children.length) runSearch();
  } else if (tabId === 'albums') {
    const albumContainer = document.getElementById('album-details-container');
    if (!albumContainer.children.length) loadAlbumFromInput();
  } else if (tabId === 'playlists') {
    const playlistContainer = document.getElementById('playlist-details-container');
    if (!playlistContainer.children.length) loadPlaylistFromInput();
  } else if (tabId === 'api-explorer') {
    if (!state.selectedMethod && state.methods.length) {
      selectMethod(state.methods[0]);
    }
  }
}

// Global Init
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupGlobalSearch();
  setupSearchPageFilters();
  setupAudioPlayer();
  await fetchStatus();
  await loadMethodsCatalog();
  loadCharts();
  loadHomeFeed();
  refreshIcons();
});

// Setup Navigation Listeners
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// Fetch Server & Auth Status
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.authStatus = data;

    const indicator = document.getElementById('status-indicator');
    const authTitle = document.getElementById('auth-title');
    const authSub = document.getElementById('auth-sub');
    const langText = document.getElementById('current-lang-text');

    if (data.authenticated) {
      indicator.classList.add('authenticated');
      authTitle.textContent = 'Authenticated';
      authSub.textContent = data.auth_type;
    } else {
      indicator.classList.remove('authenticated');
      authTitle.textContent = 'Guest (Unauthorized)';
      authSub.textContent = 'Public APIs Active';
    }

    if (langText) {
      langText.textContent = data.language + (data.location ? ` • ${data.location}` : '');
    }

    const langInput = document.getElementById('auth-language-input');
    if (langInput) langInput.value = data.language;
    const locInput = document.getElementById('auth-location-input');
    if (locInput) locInput.value = data.location;
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

// ==========================================================================
// 1. Home Feed & Charts
// ==========================================================================

async function loadCharts() {
  const country = document.getElementById('charts-country-select').value;
  const loader = document.getElementById('charts-loading');
  const grid = document.getElementById('charts-grid');

  loader.classList.remove('hidden');
  grid.innerHTML = '';

  try {
    const res = await fetch(`/api/charts?country=${encodeURIComponent(country)}`);
    const json = await res.json();
    loader.classList.add('hidden');

    if (!json.success || !json.data) {
      grid.innerHTML = `<div class="empty-state">No charts available for ${country}</div>`;
      return;
    }

    const charts = json.data;
    let items = [];

    // Collect trending items from charts (videos, artists, countries)
    if (charts.videos && charts.videos.items) {
      items = items.concat(charts.videos.items.map(i => ({ ...i, type: 'Video Chart' })));
    }
    if (charts.artists && charts.artists.items) {
      items = items.concat(charts.artists.items.map(i => ({ ...i, type: 'Top Artist' })));
    }
    if (charts.trending && charts.trending.items) {
      items = items.concat(charts.trending.items.map(i => ({ ...i, type: 'Trending' })));
    }

    if (!items.length) {
      grid.innerHTML = `<div class="empty-state">No charts returned for ${country}</div>`;
      return;
    }

    grid.innerHTML = items.slice(0, 12).map(item => renderMediaCard(item)).join('');
    refreshIcons();
  } catch (err) {
    loader.classList.add('hidden');
    grid.innerHTML = `<div class="empty-state">Failed to load charts: ${err.message}</div>`;
  }
}

async function loadHomeFeed() {
  const loader = document.getElementById('home-loading');
  const container = document.getElementById('home-shelves-container');

  loader.classList.remove('hidden');
  container.innerHTML = '';

  try {
    const res = await fetch('/api/home?limit=4');
    const json = await res.json();
    loader.classList.add('hidden');

    if (!json.success || !Array.isArray(json.data) || !json.data.length) {
      container.innerHTML = `<div class="empty-state">No home feed content available.</div>`;
      return;
    }

    container.innerHTML = json.data.map(shelf => {
      const title = shelf.title || 'Recommended';
      const items = shelf.contents || [];
      if (!items.length) return '';

      const cardsHtml = items.slice(0, 6).map(item => renderMediaCard(item)).join('');
      return `
        <div class="shelf-container">
          <div class="shelf-title">
            <i data-lucide="music-2"></i> ${title}
          </div>
          <div class="cards-grid">
            ${cardsHtml}
          </div>
        </div>
      `;
    }).join('');

    refreshIcons();
  } catch (err) {
    loader.classList.add('hidden');
    container.innerHTML = `<div class="empty-state">Failed to load home feed: ${err.message}</div>`;
  }
}

// Media Card Renderer
function renderMediaCard(item) {
  const title = item.title || item.name || 'Untitled';
  const artists = (item.artists && Array.isArray(item.artists))
    ? item.artists.map(a => a.name).join(', ')
    : (item.subscribers || item.views || item.author || (item.artists ? item.artists.name : '') || '');

  // Thumbnail resolver
  let thumbUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop';
  if (item.thumbnails && Array.isArray(item.thumbnails) && item.thumbnails.length) {
    thumbUrl = item.thumbnails[item.thumbnails.length - 1].url;
  }

  const resultType = item.resultType || item.type || (item.videoId ? 'song' : item.browseId ? 'album' : 'item');
  const videoId = item.videoId || '';
  const browseId = item.browseId || '';
  const playlistId = item.playlistId || '';

  const jsonEscaped = JSON.stringify(item).replace(/'/g, '&#39;').replace(/"/g, '&quot;');

  return `
    <div class="media-card">
      <div class="card-thumb-wrap">
        <img src="${thumbUrl}" alt="${title}" class="card-thumb" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop'">
        <div class="card-badge">${resultType}</div>
        ${videoId ? `
          <div class="card-play-overlay">
            <button class="play-circle-btn" onclick="playTrack('${videoId}', '${title.replace(/'/g, "\\'")}', '${artists.replace(/'/g, "\\'")}', '${thumbUrl}')">
              <i data-lucide="play"></i>
            </button>
          </div>
        ` : ''}
      </div>
      <div class="card-title" title="${title}">${title}</div>
      <div class="card-subtitle" title="${artists}">${artists}</div>
      <div class="card-footer-actions">
        ${browseId ? `<button class="action-link" onclick="handleCardBrowseClick('${browseId}', '${resultType}')">View Details</button>` : ''}
        ${playlistId ? `<button class="action-link" onclick="quickLoadPlaylist('${playlistId}')">View Playlist</button>` : ''}
        <button class="action-link" onclick="inspectCustomObject('${jsonEscaped}')">Inspect</button>
      </div>
    </div>
  `;
}

function handleCardBrowseClick(browseId, resultType) {
  if (browseId.startsWith('MPREb_') || resultType === 'album') {
    quickLoadAlbum(browseId);
  } else if (browseId.startsWith('VL') || browseId.startsWith('RDCLAK') || resultType === 'playlist') {
    quickLoadPlaylist(browseId);
  } else {
    // Open in API explorer with get_artist or get_album
    switchTab('api-explorer');
    const method = browseId.startsWith('UC') ? 'get_artist' : 'get_album';
    const m = state.methods.find(x => x.name === method);
    if (m) {
      selectMethod(m);
      setTimeout(() => {
        const input = document.getElementById(`param-${m.parameters[0]?.name}`);
        if (input) input.value = browseId;
      }, 100);
    }
  }
}

// ==========================================================================
// 2. Global Search & Suggestions
// ==========================================================================

let searchDebounceTimer = null;

function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('btn-clear-global-search');
  const box = document.getElementById('global-suggestions-box');

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearBtn.classList.toggle('hidden', !val);

    clearTimeout(searchDebounceTimer);
    if (!val) {
      box.classList.add('hidden');
      return;
    }

    searchDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggestions?query=${encodeURIComponent(val)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.suggestions) && json.suggestions.length) {
          box.innerHTML = json.suggestions.map(s => {
            const queryText = typeof s === 'string' ? s : (s.query || JSON.stringify(s));
            return `
              <div class="suggestion-item" onclick="selectSuggestion('${queryText.replace(/'/g, "\\'")}')">
                <i data-lucide="search"></i>
                <span>${queryText}</span>
              </div>
            `;
          }).join('');
          box.classList.remove('hidden');
          refreshIcons();
        } else {
          box.classList.add('hidden');
        }
      } catch (err) {
        console.error('Suggestions error:', err);
      }
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      box.classList.add('hidden');
      selectSuggestion(input.value.trim());
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    box.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-quick-bar')) {
      box.classList.add('hidden');
    }
  });
}

function selectSuggestion(query) {
  const globalInput = document.getElementById('global-search-input');
  const pageInput = document.getElementById('search-page-input');
  const box = document.getElementById('global-suggestions-box');

  if (globalInput) globalInput.value = query;
  if (pageInput) pageInput.value = query;
  if (box) box.classList.add('hidden');

  switchTab('search');
  runSearch();
}

// ==========================================================================
// 3. Search Page
// ==========================================================================

function setupSearchPageFilters() {
  const pills = document.querySelectorAll('#search-filter-pills .filter-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.searchFilter = pill.dataset.filter;
      runSearch();
    });
  });

  const searchInput = document.getElementById('search-page-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });
  }
}

async function runSearch() {
  const queryInput = document.getElementById('search-page-input');
  const query = queryInput ? queryInput.value.trim() : 'Blinding Lights';
  const filter = state.searchFilter || 'all';

  if (!query) {
    showToast('Please enter a search query', 'error');
    return;
  }

  const loader = document.getElementById('search-loading');
  const grid = document.getElementById('search-results-grid');
  const metaInfo = document.getElementById('search-results-info');
  const rawBtn = document.getElementById('btn-inspect-search-raw');
  const rawCode = document.getElementById('search-raw-json');

  loader.classList.remove('hidden');
  grid.innerHTML = '';
  metaInfo.textContent = `Searching for "${query}" (${filter})...`;

  try {
    const url = `/api/search?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&limit=24`;
    const res = await fetch(url);
    const json = await res.json();
    loader.classList.add('hidden');

    if (!json.success || !Array.isArray(json.data)) {
      metaInfo.textContent = `Search error: ${json.error || 'Unknown error'}`;
      grid.innerHTML = `<div class="empty-state">${json.error || 'No results found.'}</div>`;
      return;
    }

    const results = json.data;
    metaInfo.textContent = `Found ${results.length} results for "${query}" [Filter: ${filter}]`;
    rawCode.textContent = JSON.stringify(results, null, 2);
    rawBtn.style.display = 'inline-flex';

    if (!results.length) {
      grid.innerHTML = `<div class="empty-state">No matching results found for "${query}". Try another query or filter.</div>`;
      return;
    }

    grid.innerHTML = results.map(item => renderMediaCard(item)).join('');
    refreshIcons();
  } catch (err) {
    loader.classList.add('hidden');
    metaInfo.textContent = `Search failed: ${err.message}`;
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
  }
}

function toggleSearchRawJson() {
  const panel = document.getElementById('search-raw-json-container');
  panel.classList.toggle('hidden');
}

// ==========================================================================
// 4. Albums Explorer
// ==========================================================================

function quickLoadAlbum(browseId) {
  const input = document.getElementById('album-id-input');
  if (input) input.value = browseId;
  switchTab('albums');
  loadAlbumFromInput();
}

async function loadAlbumFromInput() {
  const input = document.getElementById('album-id-input');
  const browseId = input ? input.value.trim() : 'MPREb_4pL8gz094W8';
  if (!browseId) {
    showToast('Please enter an Album Browse ID', 'error');
    return;
  }

  const loader = document.getElementById('album-loading');
  const container = document.getElementById('album-details-container');

  loader.classList.remove('hidden');
  container.innerHTML = '';

  try {
    const res = await fetch(`/api/album/${encodeURIComponent(browseId)}`);
    const json = await res.json();
    loader.classList.add('hidden');

    if (!json.success || !json.data) {
      container.innerHTML = `<div class="empty-state">Failed to load album: ${json.error || 'Unknown error'}</div>`;
      return;
    }

    const album = json.data;
    const title = album.title || 'Untitled Album';
    const artists = Array.isArray(album.artists) ? album.artists.map(a => a.name).join(', ') : (album.artist || 'Unknown Artist');
    const year = album.year || '';
    const trackCount = album.trackCount || (album.tracks ? album.tracks.length : 0);
    const duration = album.duration || '';
    const desc = album.description || '';

    let thumbUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop';
    if (album.thumbnails && Array.isArray(album.thumbnails) && album.thumbnails.length) {
      thumbUrl = album.thumbnails[album.thumbnails.length - 1].url;
    }

    const tracksHtml = (album.tracks || []).map((track, idx) => {
      const tTitle = track.title || 'Track ' + (idx + 1);
      const tArtist = Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : (track.artists ? track.artists.name : artists);
      const tDuration = track.duration || '';
      const tVideoId = track.videoId || '';

      return `
        <tr>
          <td class="track-index">${idx + 1}</td>
          <td>
            <div class="track-title-cell">
              <div>
                <div class="track-title-text">${tTitle}</div>
                <div class="track-artist-text">${tArtist}</div>
              </div>
            </div>
          </td>
          <td>${tDuration}</td>
          <td>
            ${tVideoId ? `
              <button class="track-action-btn" title="Play Track" onclick="playTrack('${tVideoId}', '${tTitle.replace(/'/g, "\\'")}', '${tArtist.replace(/'/g, "\\'")}', '${thumbUrl}')">
                <i data-lucide="play"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="details-banner">
        <img src="${thumbUrl}" alt="${title}" class="details-thumb" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop'">
        <div class="details-info">
          <span class="details-type-tag"><i data-lucide="disc"></i> Album</span>
          <h2 class="details-title">${title}</h2>
          <div class="details-meta-line">
            <span><strong>${artists}</strong></span>
            ${year ? `<span>• ${year}</span>` : ''}
            <span>• ${trackCount} tracks</span>
            ${duration ? `<span>• ${duration}</span>` : ''}
          </div>
          ${desc ? `<p class="details-desc">${desc}</p>` : ''}
        </div>
      </div>

      <div class="tracks-table-container">
        <table class="tracks-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Duration</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${tracksHtml}
          </tbody>
        </table>
      </div>

      <div class="raw-json-panel" style="margin-top: 24px;">
        <div class="json-header">
          <span>Raw Album JSON (<code>get_album</code>)</span>
          <button class="btn-sm btn-secondary" onclick="copyJson('album-raw-json')"><i data-lucide="copy"></i> Copy</button>
        </div>
        <pre id="album-raw-json" class="json-code">${JSON.stringify(album, null, 2)}</pre>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    loader.classList.add('hidden');
    container.innerHTML = `<div class="empty-state">Error loading album: ${err.message}</div>`;
  }
}

// ==========================================================================
// 5. Playlists Explorer
// ==========================================================================

function quickLoadPlaylist(playlistId) {
  const input = document.getElementById('playlist-id-input');
  if (input) input.value = playlistId;
  switchTab('playlists');
  loadPlaylistFromInput();
}

async function loadPlaylistFromInput() {
  const input = document.getElementById('playlist-id-input');
  const playlistId = input ? input.value.trim() : 'RDCLAK5uy_kpx98w4q_b4e9i8a1y8k4f7';
  if (!playlistId) {
    showToast('Please enter a Playlist ID', 'error');
    return;
  }

  const loader = document.getElementById('playlist-loading');
  const container = document.getElementById('playlist-details-container');

  loader.classList.remove('hidden');
  container.innerHTML = '';

  try {
    const res = await fetch(`/api/playlist/${encodeURIComponent(playlistId)}?limit=40`);
    const json = await res.json();
    loader.classList.add('hidden');

    if (!json.success || !json.data) {
      container.innerHTML = `<div class="empty-state">Failed to load playlist: ${json.error || 'Unknown error'}</div>`;
      return;
    }

    const playlist = json.data;
    const title = playlist.title || 'Playlist';
    const author = (playlist.author && playlist.author.name) ? playlist.author.name : (playlist.author || 'YouTube Music');
    const trackCount = playlist.trackCount || (playlist.tracks ? playlist.tracks.length : 0);
    const duration = playlist.duration || '';
    const desc = playlist.description || '';

    let thumbUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop';
    if (playlist.thumbnails && Array.isArray(playlist.thumbnails) && playlist.thumbnails.length) {
      thumbUrl = playlist.thumbnails[playlist.thumbnails.length - 1].url;
    }

    const tracksHtml = (playlist.tracks || []).map((track, idx) => {
      const tTitle = track.title || 'Track ' + (idx + 1);
      const tArtist = Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : (track.artists ? track.artists.name : '');
      const tDuration = track.duration || '';
      const tVideoId = track.videoId || '';

      let tThumb = thumbUrl;
      if (track.thumbnails && Array.isArray(track.thumbnails) && track.thumbnails.length) {
        tThumb = track.thumbnails[0].url;
      }

      return `
        <tr>
          <td class="track-index">${idx + 1}</td>
          <td>
            <div class="track-title-cell">
              <img src="${tThumb}" class="track-table-thumb" alt="${tTitle}" onerror="this.src='${thumbUrl}'">
              <div>
                <div class="track-title-text">${tTitle}</div>
                <div class="track-artist-text">${tArtist}</div>
              </div>
            </div>
          </td>
          <td>${tDuration}</td>
          <td>
            ${tVideoId ? `
              <button class="track-action-btn" title="Play Track" onclick="playTrack('${tVideoId}', '${tTitle.replace(/'/g, "\\'")}', '${tArtist.replace(/'/g, "\\'")}', '${tThumb}')">
                <i data-lucide="play"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="details-banner">
        <img src="${thumbUrl}" alt="${title}" class="details-thumb" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop'">
        <div class="details-info">
          <span class="details-type-tag"><i data-lucide="list-music"></i> Playlist</span>
          <h2 class="details-title">${title}</h2>
          <div class="details-meta-line">
            <span><strong>${author}</strong></span>
            <span>• ${trackCount} tracks</span>
            ${duration ? `<span>• ${duration}</span>` : ''}
          </div>
          ${desc ? `<p class="details-desc">${desc}</p>` : ''}
        </div>
      </div>

      <div class="tracks-table-container">
        <table class="tracks-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Track</th>
              <th>Duration</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${tracksHtml}
          </tbody>
        </table>
      </div>

      <div class="raw-json-panel" style="margin-top: 24px;">
        <div class="json-header">
          <span>Raw Playlist JSON (<code>get_playlist</code>)</span>
          <button class="btn-sm btn-secondary" onclick="copyJson('playlist-raw-json')"><i data-lucide="copy"></i> Copy</button>
        </div>
        <pre id="playlist-raw-json" class="json-code">${JSON.stringify(playlist, null, 2)}</pre>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    loader.classList.add('hidden');
    container.innerHTML = `<div class="empty-state">Error loading playlist: ${err.message}</div>`;
  }
}

// ==========================================================================
// 6. All API Calls Explorer & Sandbox
// ==========================================================================

async function loadMethodsCatalog() {
  try {
    const res = await fetch('/api/methods');
    const json = await res.json();
    state.methods = json.methods || [];
    state.categories = json.categories || [];

    const badge = document.getElementById('methods-count-badge');
    const totalSpan = document.getElementById('api-methods-total');
    if (badge) badge.textContent = `${state.methods.length}`;
    if (totalSpan) totalSpan.textContent = `${state.methods.length}`;

    renderCategoryPills();
    renderMethodsList();
  } catch (err) {
    console.error('Failed to load methods catalog:', err);
  }
}

function renderCategoryPills() {
  const container = document.getElementById('category-pills-container');
  if (!container) return;

  const cats = ['all', ...state.categories];
  container.innerHTML = cats.map(cat => `
    <button class="cat-pill ${cat === state.currentCategory ? 'active' : ''}" data-cat="${cat}" onclick="filterByCategory('${cat}')">
      ${cat === 'all' ? 'All' : cat}
    </button>
  `).join('');
}

function filterByCategory(cat) {
  state.currentCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  renderMethodsList();
}

function filterMethodsList() {
  renderMethodsList();
}

function renderMethodsList() {
  const container = document.getElementById('methods-list-container');
  const searchInput = document.getElementById('method-filter-input');
  const filterText = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let filtered = state.methods;
  if (state.currentCategory !== 'all') {
    filtered = filtered.filter(m => m.category === state.currentCategory);
  }
  if (filterText) {
    filtered = filtered.filter(m => m.name.toLowerCase().includes(filterText) || m.summary.toLowerCase().includes(filterText));
  }

  if (!filtered.length) {
    container.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--text-muted);">No methods match filter</div>`;
    return;
  }

  container.innerHTML = filtered.map(m => {
    const isSelected = state.selectedMethod && state.selectedMethod.name === m.name;
    return `
      <button class="method-item-btn ${isSelected ? 'active' : ''}" onclick="selectMethodByName('${m.name}')">
        <span>${m.name}</span>
        <span class="method-item-cat">${m.category}</span>
      </button>
    `;
  }).join('');
}

function selectMethodByName(name) {
  const method = state.methods.find(m => m.name === name);
  if (method) selectMethod(method);
}

function selectMethod(method) {
  state.selectedMethod = method;
  renderMethodsList();

  const emptyCard = document.getElementById('method-runner-empty');
  const runnerCard = document.getElementById('method-runner-card');
  emptyCard.classList.add('hidden');
  runnerCard.classList.remove('hidden');

  // Fill runner header
  document.getElementById('runner-method-name').textContent = method.name;
  document.getElementById('runner-method-category').textContent = method.category;
  
  const authBadge = document.getElementById('runner-auth-badge');
  if (method.requires_auth) {
    authBadge.className = 'auth-badge auth-req';
    authBadge.textContent = '🔒 Requires Auth';
  } else {
    authBadge.className = 'auth-badge public';
    authBadge.textContent = '🟢 Public';
  }

  document.getElementById('runner-method-doc').textContent = method.doc || method.summary || 'No documentation available.';

  // Build params inputs
  const paramsContainer = document.getElementById('runner-params-container');
  if (!method.parameters || !method.parameters.length) {
    paramsContainer.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 13px;">This method accepts no arguments.</div>`;
  } else {
    paramsContainer.innerHTML = method.parameters.map(p => {
      const presetVal = (method.preset && method.preset[p.name] !== undefined)
        ? method.preset[p.name]
        : (p.default !== null && p.default !== undefined ? p.default : '');

      return `
        <div class="param-group">
          <label class="param-label" for="param-${p.name}">
            <span>${p.name} ${p.required ? '<strong style="color:var(--accent-coral)">*</strong>' : ''}</span>
            <span class="param-type">${p.type}</span>
          </label>
          <input type="text" id="param-${p.name}" name="${p.name}" placeholder="${p.default !== null ? 'Default: ' + p.default : 'Value'}" value="${presetVal}">
        </div>
      `;
    }).join('');
  }

  // Reset output
  const outputCode = document.getElementById('runner-output-json');
  const statusTag = document.getElementById('output-status-tag');
  const timeTag = document.getElementById('output-time-tag');
  outputCode.textContent = '// Press "Execute API Call" or "Load Preset" to run.';
  statusTag.className = 'status-tag';
  statusTag.textContent = 'Status: Ready';
  timeTag.classList.add('hidden');
}

function loadRunnerPreset() {
  if (!state.selectedMethod) return;
  const m = state.selectedMethod;
  if (!m.preset || !Object.keys(m.preset).length) {
    showToast('No preset available for this method', 'info');
    return;
  }
  m.parameters.forEach(p => {
    const input = document.getElementById(`param-${p.name}`);
    if (input && m.preset[p.name] !== undefined) {
      input.value = typeof m.preset[p.name] === 'object' ? JSON.stringify(m.preset[p.name]) : m.preset[p.name];
    }
  });
  showToast('Loaded preset parameters!', 'success');
}

function resetRunnerForm() {
  if (!state.selectedMethod) return;
  state.selectedMethod.parameters.forEach(p => {
    const input = document.getElementById(`param-${p.name}`);
    if (input) input.value = '';
  });
}

async function executeMethodCall(event) {
  event.preventDefault();
  if (!state.selectedMethod) return;

  const m = state.selectedMethod;
  const args = {};

  m.parameters.forEach(p => {
    const input = document.getElementById(`param-${p.name}`);
    if (input && input.value !== '') {
      args[p.name] = input.value.trim();
    }
  });

  const loader = document.getElementById('runner-output-loader');
  const outputCode = document.getElementById('runner-output-json');
  const statusTag = document.getElementById('output-status-tag');
  const timeTag = document.getElementById('output-time-tag');

  loader.classList.remove('hidden');
  outputCode.textContent = '// Running...';

  try {
    const res = await fetch('/api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: m.name,
        args: args,
      }),
    });

    const json = await res.json();
    loader.classList.add('hidden');

    timeTag.classList.remove('hidden');
    timeTag.innerHTML = `<i data-lucide="clock"></i> ${json.duration_ms || 0}ms`;

    if (json.success) {
      statusTag.className = 'status-tag ok';
      statusTag.textContent = '200 OK';
      outputCode.textContent = JSON.stringify(json.result, null, 2);
      showToast(`Method ${m.name}() executed successfully!`, 'success');
    } else {
      statusTag.className = 'status-tag err';
      statusTag.textContent = 'Error';
      outputCode.textContent = JSON.stringify(json, null, 2);
      showToast(`Error running ${m.name}: ${json.error}`, 'error');
    }

    refreshIcons();
  } catch (err) {
    loader.classList.add('hidden');
    statusTag.className = 'status-tag err';
    statusTag.textContent = 'Network Error';
    outputCode.textContent = `Network Error: ${err.message}`;
    showToast(`Request failed: ${err.message}`, 'error');
  }
}

function inspectCustomObject(jsonString) {
  try {
    const obj = JSON.parse(jsonString.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    switchTab('api-explorer');
    const runnerCard = document.getElementById('method-runner-card');
    const emptyCard = document.getElementById('method-runner-empty');
    emptyCard.classList.add('hidden');
    runnerCard.classList.remove('hidden');

    document.getElementById('runner-method-name').textContent = 'Item Inspector';
    document.getElementById('runner-method-category').textContent = 'Live Inspection';
    document.getElementById('runner-method-doc').textContent = 'Raw metadata for selected search or feed card.';
    document.getElementById('runner-params-container').innerHTML = '';

    const outputCode = document.getElementById('runner-output-json');
    const statusTag = document.getElementById('output-status-tag');
    statusTag.className = 'status-tag ok';
    statusTag.textContent = 'Inspected Object';
    outputCode.textContent = JSON.stringify(obj, null, 2);
  } catch (e) {
    showToast('Failed to parse object for inspection', 'error');
  }
}

// ==========================================================================
// 7. Direct Audio Stream Player (yt-dlp / HTML5 Audio)
// ==========================================================================

let isSeeking = false;
let currentDirectStreamUrl = '';

function setupAudioPlayer() {
  const audio = document.getElementById('direct-audio-player');
  const progress = document.getElementById('player-progress');
  const timeCur = document.getElementById('player-time-current');
  const timeTot = document.getElementById('player-time-total');
  const playIcon = document.getElementById('player-play-icon');

  if (!audio) return;

  audio.addEventListener('timeupdate', () => {
    if (!isSeeking && audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      if (progress) progress.value = pct;
      if (timeCur) timeCur.textContent = formatTime(audio.currentTime);
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    if (timeTot && audio.duration) {
      timeTot.textContent = formatTime(audio.duration);
    }
  });

  audio.addEventListener('play', () => {
    if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
    refreshIcons();
  });

  audio.addEventListener('pause', () => {
    if (playIcon) playIcon.setAttribute('data-lucide', 'play');
    refreshIcons();
  });

  audio.addEventListener('ended', () => {
    if (playIcon) playIcon.setAttribute('data-lucide', 'play');
    if (progress) progress.value = 0;
    if (timeCur) timeCur.textContent = '0:00';
    refreshIcons();
  });

  audio.addEventListener('error', (e) => {
    console.warn('Native audio error, falling back to embed player if needed:', e);
  });
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function playTrack(videoId, title, artist, thumbUrl) {
  state.currentPlayingTrack = { videoId, title, artist, thumbUrl };

  const thumb = document.getElementById('player-thumb');
  const titleEl = document.getElementById('player-title');
  const artistEl = document.getElementById('player-artist');
  const audio = document.getElementById('direct-audio-player');
  const qualityText = document.getElementById('stream-quality-text');

  if (thumb && thumbUrl) thumb.src = thumbUrl;
  if (titleEl) titleEl.textContent = title;
  if (artistEl) artistEl.textContent = artist;

  if (qualityText) {
    qualityText.textContent = 'Resolving Stream...';
  }

  showToast(`Resolving direct audio stream for: ${title}...`, 'info');

  try {
    // 1. Fetch direct stream URL from backend (yt-dlp)
    const res = await fetch(`/api/stream/${encodeURIComponent(videoId)}`);
    const json = await res.json();

    if (json.success && json.stream_url) {
      currentDirectStreamUrl = json.stream_url;
      const bitrate = json.bitrate ? `${Math.round(json.bitrate)}kbps` : '';
      const format = (json.format || 'webm').toUpperCase();
      
      if (qualityText) {
        qualityText.textContent = `⚡ Direct ${format} ${bitrate}`;
      }

      // Play via HTML5 Audio
      if (audio) {
        audio.src = json.stream_url;
        audio.play().catch(err => {
          console.warn('Autoplay prevented, user interaction required:', err);
        });
      }

      showToast(`Playing Direct Stream (${format} ${bitrate})`, 'success');
    } else {
      throw new Error(json.error || 'Could not resolve stream URL');
    }
  } catch (err) {
    console.warn('Direct stream resolution failed, falling back to iframe embed:', err);
    if (qualityText) {
      qualityText.textContent = 'YouTube Embed';
    }
    const iframe = document.getElementById('yt-embed-iframe');
    const embedWrap = document.getElementById('yt-embed-wrap');
    if (embedWrap) embedWrap.classList.remove('hidden');
    if (iframe) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
    }
    showToast(`Direct stream fallback to YouTube Embed: ${title}`, 'info');
  }
}

function togglePlayerPlayPause() {
  const audio = document.getElementById('direct-audio-player');
  if (!audio || !audio.src) {
    showToast('Select a track first to play.', 'info');
    return;
  }

  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

function onSeekChange(event) {
  isSeeking = true;
  const audio = document.getElementById('direct-audio-player');
  const timeCur = document.getElementById('player-time-current');
  if (audio && audio.duration) {
    const seekTime = (event.target.value / 100) * audio.duration;
    if (timeCur) timeCur.textContent = formatTime(seekTime);
  }
}

function onSeekCommit(event) {
  const audio = document.getElementById('direct-audio-player');
  if (audio && audio.duration) {
    audio.currentTime = (event.target.value / 100) * audio.duration;
  }
  isSeeking = false;
}

function onVolumeChange(event) {
  const audio = document.getElementById('direct-audio-player');
  const icon = document.getElementById('volume-icon');
  const vol = parseFloat(event.target.value);
  if (audio) {
    audio.volume = vol;
    audio.muted = vol === 0;
  }
  if (icon) {
    if (vol === 0) icon.setAttribute('data-lucide', 'volume-x');
    else if (vol < 0.5) icon.setAttribute('data-lucide', 'volume-1');
    else icon.setAttribute('data-lucide', 'volume-2');
    refreshIcons();
  }
}

function toggleMute() {
  const audio = document.getElementById('direct-audio-player');
  const volInput = document.getElementById('player-volume');
  const icon = document.getElementById('volume-icon');
  if (!audio) return;

  audio.muted = !audio.muted;
  if (volInput) volInput.value = audio.muted ? 0 : audio.volume;
  if (icon) {
    icon.setAttribute('data-lucide', audio.muted ? 'volume-x' : 'volume-2');
    refreshIcons();
  }
}

function copyDirectStreamUrl() {
  if (!currentDirectStreamUrl) {
    showToast('No active direct stream URL to copy. Play a track first.', 'error');
    return;
  }
  navigator.clipboard.writeText(currentDirectStreamUrl).then(() => {
    showToast('Copied direct audio stream URL to clipboard (usable in VLC/Postman/Mobile)!', 'success');
  }).catch(err => {
    showToast('Failed to copy stream URL: ' + err, 'error');
  });
}

function inspectCurrentPlaying() {
  if (!state.currentPlayingTrack || !state.currentPlayingTrack.videoId) {
    showToast('No track is currently selected.', 'info');
    return;
  }
  switchTab('api-explorer');
  const songMethod = state.methods.find(m => m.name === 'get_song');
  if (songMethod) {
    selectMethod(songMethod);
    setTimeout(() => {
      const input = document.getElementById('param-videoId');
      if (input) input.value = state.currentPlayingTrack.videoId;
      const btn = document.getElementById('btn-execute-api');
      if (btn) btn.click();
    }, 150);
  }
}

// ==========================================================================
// 8. Auth & Configuration Modal
// ==========================================================================

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('hidden');
}

function closeAuthModalOnOverlay(event) {
  if (event.target.id === 'auth-modal') {
    closeAuthModal();
  }
}

async function saveAuthSettings() {
  const lang = document.getElementById('auth-language-input').value.trim() || 'en';
  const loc = document.getElementById('auth-location-input').value.trim() || '';
  const rawAuth = document.getElementById('auth-raw-input').value.trim() || null;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: rawAuth,
        language: lang,
        location: loc,
      }),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Settings & Auth updated successfully!', 'success');
      closeAuthModal();
      await fetchStatus();
    } else {
      showToast('Auth error: ' + (json.error || 'Failed to update credentials'), 'error');
    }
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

async function resetGuestAuth() {
  document.getElementById('auth-raw-input').value = '';
  document.getElementById('auth-language-input').value = 'en';
  document.getElementById('auth-location-input').value = '';
  await saveAuthSettings();
}
