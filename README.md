# ☑ Weekly TODO

A minimal weekly task manager with cloud sync.

## Features

- Infinite scrolling timeline
- Drag & drop tasks between days
- Deadlines panel with countdown
- Category colors
- Dark theme
- Works offline

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `Esc` | Close modal |

## License

MIT

## Future: Phone Access Roadmap

The app is architected with a swappable **`Storage`** layer. To enable multi-device sync:

### Option A — Simple (PWA + Cloud Sync)
1. Add a `manifest.json` + service worker → installable on phone
2. Swap `localStorage` for a cloud backend (Firebase, Supabase, or your own API)
3. Add authentication

### Option B — Self-Hosted
1. Add a Node.js/Express (or Python/FastAPI) backend with SQLite/Postgres
2. Point `Storage` methods at REST endpoints instead of `localStorage`
3. Host on your local network or a VPS
4. Access from any device via the URL

### Option C — Tauri / Electron (Desktop) + React Native (Mobile)
For native apps with offline-first sync.

## Project Structure

```
TODO/
├── index.html      ← Open this in a browser
├── styles.css      ← All styling (dark theme, responsive)
├── app.js          ← Core logic (rendering, CRUD, drag-drop, summary)
├── storage.js      ← Data layer (localStorage, export/import)
└── README.md       ← You are here
```
