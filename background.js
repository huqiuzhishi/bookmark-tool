// background.js — Most-Recently-Used (MRU) tab switcher with a visual overlay
//
// Tracks the order in which tabs are visited and lets the user cycle through
// the 8 most recently visited tabs with a keyboard shortcut, Alt+Tab style,
// showing an Arc-like overlay (thumbnail + title) inside the current page.
//
// Behaviour:
//   - 1st press  → overlay appears on the current tab; selection highlights
//     the most recently visited *other* tab.
//   - Each press → moves the highlight one further back (no tab switch yet).
//   - On pause (CYCLE_TIMEOUT) the selection commits: the highlighted tab is
//     activated and becomes the most recent.
//
// Thumbnails are captured while a tab is visible (captureVisibleTab can only
// grab the active tab) and cached; tabs without a capture fall back to their
// favicon. Overlay is injected into the current page, so it can't appear on
// restricted pages (chrome://, Web Store, PDF viewer, blank new-tab).
//
// NOTE: Chrome reserves Ctrl+Tab for the browser, so extensions can't bind it.
// Rebind the command at chrome://extensions/shortcuts

const MAX_RECENT    = 8;    // how many recent tabs to cycle through
const CYCLE_TIMEOUT = 1500; // ms of inactivity before the cycle commits
const THUMB_MAX_W   = 360;  // downscaled thumbnail width (px)
const THUMB_CACHE   = 40;   // max cached thumbnails

// ── MRU list persistence ─────────────────────────────────────────────────────

async function getMru() {
  const { mruTabs = [] } = await chrome.storage.session.get('mruTabs');
  return mruTabs;
}

async function setMru(list) {
  await chrome.storage.session.set({ mruTabs: list });
}

async function touchTab(tabId) {
  if (tabId == null) return;
  let list = await getMru();
  list = list.filter(id => id !== tabId);
  list.unshift(tabId);
  if (list.length > 50) list = list.slice(0, 50);
  await setMru(list);
}

async function forgetTab(tabId) {
  let list = await getMru();
  const next = list.filter(id => id !== tabId);
  if (next.length !== list.length) await setMru(next);
}

async function seedMru() {
  const tabs = await chrome.tabs.query({});
  const ordered = tabs
    .slice()
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .map(t => t.id)
    .filter(id => id != null);
  await setMru(ordered.slice(0, 50));
}

// ── Thumbnail cache ──────────────────────────────────────────────────────────
// In-memory; rebuilt as you browse if the service worker restarts.

const thumbs = new Map(); // tabId -> jpeg data URL

function cacheThumb(tabId, dataUrl) {
  thumbs.delete(tabId);        // refresh insertion order (LRU-ish)
  thumbs.set(tabId, dataUrl);
  while (thumbs.size > THUMB_CACHE) {
    thumbs.delete(thumbs.keys().next().value);
  }
}

function isCapturable(url = '') {
  return /^https?:|^file:/.test(url);
}

async function captureTab(tabId, windowId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || !isCapturable(tab.url)) return;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'jpeg', quality: 70
    });
    cacheThumb(tabId, await downscale(dataUrl, THUMB_MAX_W));
  } catch { /* protected page, not visible, etc. */ }
}

// Downscale a data URL using OffscreenCanvas (available in the service worker).
async function downscale(dataUrl, maxW) {
  try {
    const blob   = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale  = Math.min(1, maxW / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width  * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
    const bytes = new Uint8Array(await out.arrayBuffer());
    return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
  } catch {
    return dataUrl; // fall back to the full-size capture
  }
}

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

let captureTimer = null;
function scheduleCapture(tabId, windowId) {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = setTimeout(() => captureTab(tabId, windowId), 600);
}

// ── Cycle state (in-memory, short-lived) ─────────────────────────────────────

let cycling        = false;
let cycleItems     = [];   // [{ tabId, title, url, favicon, thumb }]
let cycleIndex     = 0;
let cycleTimer     = null;
let anchorTabId    = null; // tab the overlay is drawn on (stays visible)

// ── Event listeners ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(seedMru);
chrome.runtime.onStartup.addListener(seedMru);

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  touchTab(tabId);
  scheduleCapture(tabId, windowId);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) {
    scheduleCapture(tabId, tab.windowId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
  thumbs.delete(tabId);
  if (cycling) {
    const at = cycleItems.findIndex(i => i.tabId === tabId);
    if (at !== -1) {
      cycleItems.splice(at, 1);
      if (at <= cycleIndex && cycleIndex > 0) cycleIndex--;
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'cycle-recent-tabs') cycleRecentTabs();
});

// ── Cycling logic ────────────────────────────────────────────────────────────

async function cycleRecentTabs() {
  if (!cycling) await startCycle();

  if (cycleItems.length <= 1) { await endCycle(); return; }

  cycleIndex = (cycleIndex + 1) % cycleItems.length;
  await showOverlay();
  scheduleCommit();
}

async function startCycle() {
  const list = await getMru();
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });

  let ids = list.slice();
  if (active?.id != null) {
    ids = ids.filter(id => id !== active.id);
    ids.unshift(active.id);
  }
  ids = ids.slice(0, MAX_RECENT);

  // The anchor tab is visible right now — grab a fresh thumbnail of it.
  if (active?.id != null) await captureTab(active.id, active.windowId);

  const items = [];
  for (const id of ids) {
    try {
      const t = await chrome.tabs.get(id);
      items.push({
        tabId:   id,
        title:   t.title || 'Untitled',
        url:     t.url || '',
        favicon: t.favIconUrl || '',
        thumb:   thumbs.get(id) || null,
      });
    } catch { /* tab gone */ }
  }

  cycleItems  = items;
  cycleIndex  = 0;
  cycling     = true;
  anchorTabId = active?.id ?? null;
}

function scheduleCommit() {
  if (cycleTimer) clearTimeout(cycleTimer);
  cycleTimer = setTimeout(endCycle, CYCLE_TIMEOUT);
}

async function showOverlay() {
  if (anchorTabId == null) return;
  const payload = {
    selected: cycleIndex,
    items: cycleItems.map(i => ({ title: i.title, favicon: i.favicon, thumb: i.thumb })),
  };
  try {
    await chrome.scripting.executeScript({
      target: { tabId: anchorTabId },
      func: overlayRender,
      args: [payload],
    });
  } catch { /* restricted page — cycle still works, just no overlay */ }
}

async function endCycle() {
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }

  const landed = cycleItems[cycleIndex]?.tabId ?? null;
  const anchor = anchorTabId;

  cycling     = false;
  cycleItems  = [];
  cycleIndex  = 0;
  anchorTabId = null;

  if (anchor != null) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: anchor }, func: overlayRemove });
    } catch { /* ignore */ }
  }

  if (landed != null && landed !== anchor) {
    try {
      const tab = await chrome.tabs.get(landed);
      await chrome.tabs.update(landed, { active: true });
      if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    } catch { /* tab gone */ }
  }

  if (landed != null) touchTab(landed);
}

// ── Overlay (runs in the page via chrome.scripting.executeScript) ────────────
// Must be fully self-contained: no references to outer scope.

function overlayRender(payload) {
  const ID = '__mru_switcher__';
  const { items, selected } = payload;

  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ID;
    host.attachShadow({ mode: 'open' });
    (document.body || document.documentElement).appendChild(host);
  }
  const shadow = host.shadowRoot;

  // Fast path: same cards already rendered — just move the highlight.
  const cards = shadow.querySelectorAll('.card');
  if (cards.length === items.length) {
    cards.forEach((el, i) => el.classList.toggle('sel', i === selected));
    return;
  }

  const cardsHtml = items.map((it, i) => {
    const media = it.thumb
      ? `<img class="thumb" src="${it.thumb}" alt="">`
      : `<div class="thumb noimg">${it.favicon
          ? `<img class="fav-lg" src="${it.favicon}" alt="">`
          : `<div class="fav-fallback"></div>`}</div>`;
    const fav = it.favicon ? `<img class="fav" src="${it.favicon}" alt="">` : '';
    const title = (it.title || 'Untitled')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="card${i === selected ? ' sel' : ''}">
        ${media}
        <div class="label">${fav}<span class="title">${title}</span></div>
      </div>`;
  }).join('');

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .backdrop {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: rgba(15, 17, 21, 0.55);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .rail {
        display: flex; gap: 10px; padding: 16px 18px;
        max-width: 94vw; overflow-x: auto;
        background: rgba(28, 30, 36, 0.92);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      }
      .card {
        flex: 1 1 0; min-width: 96px; max-width: 150px;
        border-radius: 10px; padding: 6px;
        background: rgba(255,255,255,0.03);
        border: 2px solid transparent;
        transition: transform .12s ease, border-color .12s ease, background .12s ease;
      }
      .card.sel {
        border-color: #4c8dff;
        background: rgba(76,141,255,0.14);
        transform: translateY(-3px) scale(1.03);
      }
      .thumb {
        display: block; width: 100%; height: 82px;
        object-fit: cover; border-radius: 6px;
        background: #14161b;
      }
      .thumb.noimg { display: flex; align-items: center; justify-content: center; }
      .fav-lg { width: 32px; height: 32px; opacity: .9; }
      .fav-fallback {
        width: 32px; height: 32px; border-radius: 6px;
        background: linear-gradient(135deg,#3a3f4b,#242730);
      }
      .label { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding: 0 2px; }
      .fav { width: 14px; height: 14px; flex: 0 0 auto; border-radius: 4px; }
      .title {
        color: #eef1f6; font-size: 12px; line-height: 1.3;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
    </style>
    <div class="backdrop"><div class="rail">${cardsHtml}</div></div>`;

  // Keep the selected card in view.
  const sel = shadow.querySelector('.card.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function overlayRemove() {
  const el = document.getElementById('__mru_switcher__');
  if (el) el.remove();
}
