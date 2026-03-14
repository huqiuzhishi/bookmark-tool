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
  }
};
