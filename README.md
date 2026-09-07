# Bookmark Tool

A lightweight Chrome extension for bookmarking webpages with personal notes and fuzzy search.

## Features

- **One-click bookmark** — Click the extension icon to save the current page
- **Keyboard shortcut** — `Alt+Shift+B` to open (configurable in `chrome://extensions/shortcuts`)
- **Recent-tab switcher** — `Ctrl+Shift+Space` cycles through your 8 most recently visited tabs with an Arc-style overlay (thumbnail + title)
- **Notes** — Add a few words describing what each bookmark is about
- **Fuzzy search** — Search across URL, title, and notes simultaneously
- **Duplicate detection** — Prevents saving the same URL twice
- **Zero dependencies** — Pure vanilla JS, no build step required

## Install

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `bookmark-tool` folder

## Usage

| Action | How |
|--------|-----|
| Add bookmark | Click extension icon → click `+` → add notes → Save |
| Search | Type in the search bar — fuzzy matches URL, title, and notes |
| Open bookmark | Click any bookmark in the list |
| Delete bookmark | Hover a bookmark → click the `×` button |
| Switch to recent tab | Press `Ctrl+Shift+Space` — repeat quickly to step further back |

### Recent-tab switcher

The extension tracks the order in which you visit tabs. Pressing the switcher
shortcut shows an **overlay** on the current page listing your 8 most recently
visited tabs (thumbnail + favicon + title). The first press highlights the most
recent *other* tab; each further press within ~1.5s moves the highlight one
further back. Pause, and the highlighted tab is activated and becomes the new
"most recent".

Thumbnails are captured while a tab is visible and cached in memory; tabs
without a capture show their favicon instead. The overlay can't be drawn on
restricted pages (`chrome://`, the Web Store, the PDF viewer, or a blank
new-tab page) — switching still works there, just without the visual.

> **Note on `Ctrl+Tab`:** Chrome reserves `Ctrl+Tab` (and `Ctrl+Shift+Tab`,
> `Ctrl+W`, etc.) for the browser, so no extension can bind it — the key event
> never reaches extension or page code. The default is therefore
> `Ctrl+Shift+Space` (`Cmd+Shift+Space` on macOS). You can rebind it to any
> Chrome-allowed combo at `chrome://extensions/shortcuts`.

## File Structure

```
manifest.json    — Chrome MV3 extension manifest
background.js    — Service worker: MRU tracking, tab thumbnails + switcher overlay
popup.html/css/js — Extension popup UI
storage.js       — CRUD layer over chrome.storage.local
search.js        — Custom fuzzy search engine
icons/           — Extension icons (16/48/128px)
```

## License

MIT
