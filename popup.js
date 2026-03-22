document.addEventListener('DOMContentLoaded', async () => {
  const addBtn          = document.getElementById('addBtn');
  const addForm         = document.getElementById('addForm');
  const titleInput      = document.getElementById('titleInput');
  const urlInput        = document.getElementById('urlInput');
  const notesInput      = document.getElementById('notesInput');
  const saveBtn         = document.getElementById('saveBtn');
  const cancelBtn       = document.getElementById('cancelBtn');
  const searchInput     = document.getElementById('searchInput');
  const bookmarkList    = document.getElementById('bookmarkList');
  const tabList         = document.getElementById('tabList');
  const statusBar       = document.getElementById('statusBar');
  const toggleBookmarks = document.getElementById('toggleBookmarks');
  const toggleTabs      = document.getElementById('toggleTabs');

  let allBookmarks = [];
  let allTabs      = [];
  let isAddMode    = false;
  let statusTimer  = null;
  let currentView  = 'bookmarks';

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.replace(/\/$/, '');
    } catch { return url; }
  }

  function relativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000)    return 'Just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    const d = new Date(ts);
    const now = new Date();
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  function showStatus(msg, duration = 1800) {
    if (statusTimer) clearTimeout(statusTimer);
    statusBar.textContent = msg;
    statusBar.classList.remove('hidden');
    statusTimer = setTimeout(() => statusBar.classList.add('hidden'), duration);
  }

  // ── View Toggle ───────────────────────────────────────────────────────────

  function setView(view) {
    currentView = view;

    if (view === 'bookmarks') {
      bookmarkList.classList.remove('hidden');
      tabList.classList.add('hidden');
      toggleBookmarks.classList.add('active');
      toggleTabs.classList.remove('active');
      searchInput.placeholder = 'Search bookmarks...';
      renderBookmarks();
    } else {
      bookmarkList.classList.add('hidden');
      tabList.classList.remove('hidden');
      toggleBookmarks.classList.remove('active');
      toggleTabs.classList.add('active');
      searchInput.placeholder = 'Search open tabs...';
      renderTabs();
    }
  }

  toggleBookmarks.addEventListener('click', () => setView('bookmarks'));
  toggleTabs.addEventListener('click', () => {
    if (allTabs.length === 0) loadTabs().then(() => setView('tabs'));
    else setView('tabs');
  });

  // ── Bookmarks ─────────────────────────────────────────────────────────────

  async function loadBookmarks() {
    allBookmarks = await BookmarkStorage.getAll();
    if (currentView === 'bookmarks') renderBookmarks();
  }

  function renderBookmarks() {
    const query    = searchInput.value.trim();
    const filtered = FuzzySearch.search(allBookmarks, query);

    if (filtered.length === 0) {
      const msg  = query ? 'No matching bookmarks' : 'No bookmarks yet';
      const hint = query ? 'Try a different search term' : 'Click + to bookmark this page';
      bookmarkList.innerHTML = `
        <div class="empty-state">
          <p>${msg}</p>
          <p class="hint">${hint}</p>
        </div>`;
      return;
    }

    bookmarkList.innerHTML = filtered.map(b => `
      <div class="bookmark-item" data-id="${b.id}" data-url="${esc(b.url)}">
        <div class="bookmark-info">
          <div class="bookmark-title">${esc(b.title || 'Untitled')}</div>
          <div class="bookmark-url">${esc(cleanUrl(b.url))}</div>
          ${b.notes ? `<div class="bookmark-notes">${esc(b.notes)}</div>` : ''}
          <div class="bookmark-date">${relativeTime(b.createdAt)}</div>
        </div>
        <div class="bookmark-actions">
          <button class="btn-delete" data-id="${b.id}" title="Delete bookmark">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </div>`).join('');
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  async function loadTabs() {
    const tabs = await chrome.tabs.query({});
    allTabs = tabs
      .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  }

  function renderTabs() {
    const query   = searchInput.value.trim();
    const results = FuzzySearch.searchItems(allTabs, query, [
      { field: 'title', weight: 1.0 },
      { field: 'url',   weight: 0.8 },
    ]);

    const windowIds = [...new Set(allTabs.map(t => t.windowId))];
    const multiWindow = windowIds.length > 1;

    if (results.length === 0) {
      const msg  = query ? 'No matching tabs' : 'No open tabs';
      const hint = query ? 'Try a different search term' : '';
      tabList.innerHTML = `
        <div class="empty-state">
          <p>${msg}</p>
          ${hint ? `<p class="hint">${hint}</p>` : ''}
        </div>`;
      return;
    }

    tabList.innerHTML = results.map(t => {
      const faviconSvg = `<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5">
               <rect x="1" y="1" width="14" height="14" rx="2"/>
               <line x1="1" y1="5" x2="15" y2="5"/>
             </svg>`;
      const faviconUrl = t.favIconUrl
        ? `<img class="tab-favicon" src="${esc(t.favIconUrl)}" alt="" data-favicon>
           <span class="tab-favicon-placeholder hidden">${faviconSvg}</span>`
        : `<span class="tab-favicon-placeholder">${faviconSvg}</span>`;

      const windowLabel = multiWindow
        ? `<span class="tab-window-badge">Win ${windowIds.indexOf(t.windowId) + 1}</span>`
        : '';
      const activeLabel = t.active
        ? `<span class="tab-active-badge">active</span>`
        : '';

      return `
        <div class="tab-item" data-tab-id="${t.id}" data-window-id="${t.windowId}">
          ${faviconUrl}
          <div class="tab-info">
            <div class="tab-title">${esc(t.title || 'Untitled')}</div>
            <div class="tab-url">${esc(cleanUrl(t.url))}</div>
            <div class="tab-meta">
              <span class="tab-time">${relativeTime(t.lastAccessed)}</span>
              ${activeLabel}
              ${windowLabel}
            </div>
          </div>
        </div>`;
    }).join('');

    tabList.insertAdjacentHTML('beforeend',
      `<div class="tab-count-footer">${allTabs.length} open tab${allTabs.length !== 1 ? 's' : ''}${multiWindow ? ` across ${windowIds.length} windows` : ''}</div>`
    );
  }

  tabList.addEventListener('error', (e) => {
    if (e.target.dataset.favicon !== undefined) {
      e.target.classList.add('hidden');
      e.target.nextElementSibling.classList.remove('hidden');
    }
  }, true);

  tabList.addEventListener('click', async (e) => {
    const item = e.target.closest('.tab-item');
    if (!item) return;
    const tabId    = parseInt(item.dataset.tabId, 10);
    const windowId = parseInt(item.dataset.windowId, 10);
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
    window.close();
  });

  // ── Add Form ──────────────────────────────────────────────────────────────

  function toggleAddMode(show) {
    isAddMode = show;
    if (show) {
      titleInput.value  = activeTab?.title || '';
      urlInput.value    = activeTab?.url   || '';
      notesInput.value  = '';
      addForm.classList.remove('hidden');
      addBtn.classList.add('active');
      setTimeout(() => notesInput.focus(), 50);
    } else {
      addForm.classList.add('hidden');
      addBtn.classList.remove('active');
    }
  }

  addBtn.addEventListener('click', async () => {
    if (isAddMode) { toggleAddMode(false); return; }
    if (await BookmarkStorage.exists(activeTab?.url)) {
      showStatus('Already bookmarked!');
      return;
    }
    toggleAddMode(true);
  });

  saveBtn.addEventListener('click', async () => {
    const url   = urlInput.value;
    const title = titleInput.value;
    const notes = notesInput.value.trim();
    if (!url) return;
    await BookmarkStorage.add({ url, title, notes });
    toggleAddMode(false);
    showStatus('Bookmark saved!');
    await loadBookmarks();
  });

  cancelBtn.addEventListener('click', () => toggleAddMode(false));

  // ── Search ────────────────────────────────────────────────────────────────

  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (currentView === 'bookmarks') renderBookmarks();
      else renderTabs();
    }, 80);
  });

  bookmarkList.addEventListener('click', async (e) => {
    const del = e.target.closest('.btn-delete');
    if (del) {
      e.stopPropagation();
      await BookmarkStorage.remove(del.dataset.id);
      showStatus('Deleted');
      await loadBookmarks();
      return;
    }
    const item = e.target.closest('.bookmark-item');
    if (item) chrome.tabs.create({ url: item.dataset.url });
  });

  // ── Keyboard ──────────────────────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isAddMode) toggleAddMode(false);
      else window.close();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isAddMode) {
      saveBtn.click();
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  searchInput.focus();
  await Promise.all([loadBookmarks(), loadTabs()]);
  setView('tabs');
});
