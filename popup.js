document.addEventListener('DOMContentLoaded', async () => {
  const addBtn = document.getElementById('addBtn');
  const addForm = document.getElementById('addForm');
  const titleInput = document.getElementById('titleInput');
  const urlInput = document.getElementById('urlInput');
  const notesInput = document.getElementById('notesInput');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const searchInput = document.getElementById('searchInput');
  const bookmarkList = document.getElementById('bookmarkList');
  const statusBar = document.getElementById('statusBar');

  let allBookmarks = [];
  let isAddMode = false;
  let statusTimer = null;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  async function loadBookmarks() {
    allBookmarks = await BookmarkStorage.getAll();
    renderBookmarks();
  }

  function renderBookmarks() {
    const query = searchInput.value.trim();
    const filtered = FuzzySearch.search(allBookmarks, query);

    if (filtered.length === 0) {
      const msg = query ? 'No matching bookmarks' : 'No bookmarks yet';
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
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
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

  function toggleAddMode(show) {
    isAddMode = show;
    if (show) {
      titleInput.value = tab?.title || '';
      urlInput.value = tab?.url || '';
      notesInput.value = '';
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
    if (await BookmarkStorage.exists(tab?.url)) {
      showStatus('Already bookmarked!');
      return;
    }
    toggleAddMode(true);
  });

  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value;
    const title = titleInput.value;
    const notes = notesInput.value.trim();
    if (!url) return;
    await BookmarkStorage.add({ url, title, notes });
    toggleAddMode(false);
    showStatus('Bookmark saved!');
    await loadBookmarks();
  });

  cancelBtn.addEventListener('click', () => toggleAddMode(false));

  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderBookmarks, 80);
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
    if (item) {
      chrome.tabs.create({ url: item.dataset.url });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isAddMode) toggleAddMode(false);
      else window.close();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isAddMode) {
      saveBtn.click();
    }
  });

  searchInput.focus();
  await loadBookmarks();
});
