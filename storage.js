const BookmarkStorage = {
  async getAll() {
    const result = await chrome.storage.local.get({ bookmarks: [] });
    return result.bookmarks;
  },

  async add(bookmark) {
    const bookmarks = await this.getAll();
    bookmark.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    bookmark.createdAt = Date.now();
    bookmarks.unshift(bookmark);
    await chrome.storage.local.set({ bookmarks });
    return bookmark;
  },

  async remove(id) {
    const bookmarks = await this.getAll();
    const filtered = bookmarks.filter(b => b.id !== id);
    await chrome.storage.local.set({ bookmarks: filtered });
  },

  async update(id, updates) {
    const bookmarks = await this.getAll();
    const idx = bookmarks.findIndex(b => b.id === id);
    if (idx !== -1) {
      bookmarks[idx] = { ...bookmarks[idx], ...updates };
      await chrome.storage.local.set({ bookmarks });
    }
  },

  async exists(url) {
    const bookmarks = await this.getAll();
    return bookmarks.some(b => b.url === url);
  },

  normalizeBookmark(bookmark) {
    if (!bookmark || typeof bookmark !== 'object') return null;
    if (typeof bookmark.url !== 'string' || !bookmark.url.trim()) return null;

    return {
      id: typeof bookmark.id === 'string' && bookmark.id
        ? bookmark.id
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      url: bookmark.url.trim(),
      title: typeof bookmark.title === 'string' ? bookmark.title : '',
      notes: typeof bookmark.notes === 'string' ? bookmark.notes : '',
      createdAt: Number.isFinite(bookmark.createdAt) ? bookmark.createdAt : Date.now()
    };
  },

  async importMany(importedBookmarks) {
    if (!Array.isArray(importedBookmarks)) {
      throw new Error('Expected a bookmarks array');
    }

    const bookmarks = await this.getAll();
    const existingUrls = new Set(bookmarks.map(b => b.url));
    const existingIds = new Set(bookmarks.map(b => b.id));
    const newBookmarks = [];

    for (const bookmark of importedBookmarks) {
      const normalized = this.normalizeBookmark(bookmark);
      if (!normalized || existingUrls.has(normalized.url)) continue;

      while (existingIds.has(normalized.id)) {
        normalized.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      }

      existingUrls.add(normalized.url);
      existingIds.add(normalized.id);
      newBookmarks.push(normalized);
    }

    if (newBookmarks.length > 0) {
      await chrome.storage.local.set({ bookmarks: [...newBookmarks, ...bookmarks] });
    }

    return newBookmarks.length;
  }
};
