// background.js — Most-Recently-Used (MRU) tab switcher
//
// Tracks the order in which tabs are visited and lets the user cycle through
// the 8 most recently visited tabs with a keyboard shortcut, Alt+Tab style.
//
// Behaviour (matching the classic Alt+Tab switcher):
//   - From the current tab, the first press jumps to the most recently
//     visited *other* tab.
//   - Each additional press *within the cycle window* steps one further back
//     through the MRU list (2nd most recent, 3rd most recent, ...).
//   - After a short pause (CYCLE_TIMEOUT) the cycle "commits": the tab you
//     landed on becomes the most recent, and the next press starts fresh.
//
// NOTE: Chrome reserves Ctrl+Tab for the browser, so extensions can't bind it.
// The command below uses an allowed default; rebind it at
// chrome://extensions/shortcuts

const MAX_RECENT    = 8;    // how many recent tabs to cycle through
const CYCLE_TIMEOUT = 1500; // ms of inactivity before the cycle commits

// ── MRU list persistence ─────────────────────────────────────────────────────
// The service worker can be terminated between events, so the MRU order lives
// in chrome.storage.session and is reloaded on demand.

async function getMru() {
  const { mruTabs = [] } = await chrome.storage.session.get('mruTabs');
  return mruTabs;
}

async function setMru(list) {
  await chrome.storage.session.set({ mruTabs: list });
}

// Move a tab to the front of the MRU list (most recent).
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

// Seed the MRU list from the browser's own lastAccessed ordering.
async function seedMru() {
  const tabs = await chrome.tabs.query({});
  const ordered = tabs
    .slice()
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .map(t => t.id)
    .filter(id => id != null);
  await setMru(ordered.slice(0, 50));
}

// ── Cycle state (in-memory, short-lived) ─────────────────────────────────────

let cycling            = false;
let cycleList          = [];
let cycleIndex         = 0;
let cycleTimer         = null;
let suppressActivation = false; // ignore onActivated fired by our own switches

// ── Event listeners ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(seedMru);
chrome.runtime.onStartup.addListener(seedMru);

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // While cycling we drive activation ourselves and must not reorder the list,
  // otherwise repeated presses would bounce between two tabs.
  if (suppressActivation) return;
  touchTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
  // Drop it from an in-progress cycle too.
  if (cycling) {
    const removedAt = cycleList.indexOf(tabId);
    if (removedAt !== -1) {
      cycleList.splice(removedAt, 1);
      if (removedAt <= cycleIndex && cycleIndex > 0) cycleIndex--;
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'cycle-recent-tabs') cycleRecentTabs();
});

// ── Cycling logic ────────────────────────────────────────────────────────────

async function cycleRecentTabs() {
  if (!cycling) await startCycle();

  if (cycleList.length <= 1) { endCycle(); return; }

  // Step to the next-older tab, wrapping around the (capped) list.
  cycleIndex = (cycleIndex + 1) % cycleList.length;
  const targetId = cycleList[cycleIndex];

  suppressActivation = true;
  try {
    const tab = await chrome.tabs.get(targetId);
    await chrome.tabs.update(targetId, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch {
    // The tab vanished — drop it and retry on the next press.
    cycleList.splice(cycleIndex, 1);
    if (cycleIndex > 0) cycleIndex--;
  }

  scheduleCommit();
}

async function startCycle() {
  const list = await getMru();

  // Make sure the currently-focused tab is the cycle's anchor (index 0).
  let base = list.slice();
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id != null) {
    base = base.filter(id => id !== active.id);
    base.unshift(active.id);
  }

  cycleList  = base.slice(0, MAX_RECENT);
  cycleIndex = 0;
  cycling    = true;
}

function scheduleCommit() {
  if (cycleTimer) clearTimeout(cycleTimer);
  cycleTimer = setTimeout(endCycle, CYCLE_TIMEOUT);
}

function endCycle() {
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }

  const landed = cycleList[cycleIndex];

  cycling            = false;
  suppressActivation = false;
  cycleList          = [];
  cycleIndex         = 0;

  // Commit: the tab we settled on is now the most recently used.
  if (landed != null) touchTab(landed);
}
