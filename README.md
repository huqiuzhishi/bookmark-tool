# Bookmark Tool

A lightweight Chrome extension for bookmarking webpages with personal notes and fuzzy search.

## Features

- **One-click bookmark** — Click the extension icon to save the current page
- **Keyboard shortcut** — `Alt+Shift+B` to open (configurable in `chrome://extensions/shortcuts`)
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

## File Structure

```
manifest.json    — Chrome MV3 extension manifest
popup.html/css/js — Extension popup UI
storage.js       — CRUD layer over chrome.storage.local
search.js        — Custom fuzzy search engine
icons/           — Extension icons (16/48/128px)
```

## License

MIT
