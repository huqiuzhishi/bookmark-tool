const FuzzySearch = {
  /**
   * Score how well `query` matches `target`.
   * Returns 0 if no match, higher = better.
   */
  scoreMatch(query, target) {
    if (!target) return 0;
    query = query.toLowerCase();
    target = target.toLowerCase();

    if (target === query) return 100;

    const subIdx = target.indexOf(query);
    if (subIdx !== -1) {
      if (subIdx === 0) return 90;
      const prev = target[subIdx - 1];
      if (prev === ' ' || prev === '/' || prev === '.' || prev === '-' || prev === '_') return 85;
      return 75;
    }

    let qIdx = 0;
    let consecutive = 0;
    let score = 0;
    let firstMatch = -1;

    for (let tIdx = 0; tIdx < target.length && qIdx < query.length; tIdx++) {
      if (target[tIdx] === query[qIdx]) {
        if (firstMatch === -1) firstMatch = tIdx;
        consecutive++;
        score += consecutive * 2;
        const prev = target[tIdx - 1];
        if (tIdx === 0 || prev === ' ' || prev === '/' || prev === '.' || prev === '-' || prev === '_') {
          score += 5;
        }
        qIdx++;
      } else {
        consecutive = 0;
      }
    }

    if (qIdx < query.length) return 0;

    const spread = target.length - firstMatch;
    score = score * (query.length / Math.max(spread, 1)) * 0.5;
    return Math.min(score, 70);
  },

  search(bookmarks, query) {
    if (!query || !query.trim()) return bookmarks;

    const tokens = query.trim().toLowerCase().split(/\s+/);

    const scored = bookmarks.map(bookmark => {
      let total = 0;

      for (const token of tokens) {
        const urlScore = this.scoreMatch(token, bookmark.url) * 0.8;
        const titleScore = this.scoreMatch(token, bookmark.title) * 1.0;
        const notesScore = this.scoreMatch(token, bookmark.notes) * 0.9;
        const best = Math.max(urlScore, titleScore, notesScore);

        if (best === 0) return { bookmark, score: 0 };
        total += best;
      }

      return { bookmark, score: total };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.bookmark);
  }
};
