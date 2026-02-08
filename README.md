# ☑ Weekly TODO App

A local, offline-first weekly task manager that runs in your browser. Dark-themed, keyboard-friendly, and designed for students & developers who want a clean week-at-a-glance view.

## Quick Start

Just open **`index.html`** in your browser. That's it — no install, no build step.

## Features

| Feature | Description |
|---|---|
| **Week Overview** | 7-day grid (Sunday → Saturday) showing all tasks per day |
| **Deadlines Panel** | Dedicated sidebar panel listing all upcoming deadlines, grouped by date |
| **Deadline Day Indicators** | Day columns with deadlines are highlighted in orange with tags showing what's due |
| **Backlog** | Unassigned & late tasks — drag them to schedule |
| **Inline Quick-Add** | Click `+` on any day, type a title, press Enter — edit modal opens for details |
| **Mark Done** | Click the circle to toggle completion |
| **Late Task Alerts** | Overdue tasks glow progressively redder; late tasks in backlog show a ⚠ LATE badge |
| **Time Estimates** | Set minutes per task; see total remaining work per day |
| **Category Colours** | Each category gets a unique colour — visible as left border + badge |
| **Drag & Drop** | Drag tasks between days, reorder within a day, or drag to/from backlog |
| **Summary Page** | 📊 Toggle a dashboard with overall stats, per-category breakdown, weekly overview, and upcoming deadlines |
| **Search** | Real-time task filter across all days and backlog |
| **Export / Import** | Backup & restore your data as JSON |
| **Keyboard Shortcuts** | `N` = new task today, `←`/`→` = navigate weeks, `Esc` = close modal |
| **Dark Theme** | Easy on the eyes |
| **Responsive** | Works on desktop, tablet, and phone browsers |
| **Offline** | 100% localStorage — no server, no internet required |

## Deadline Indicators

When a task has a deadline on a particular day, that day column in the week view will:
- Get an **orange border** so it stands out visually
- Show **deadline tags** in the header listing what's due that day
- Overdue deadline tags turn **red**

The **Deadlines Panel** on the right sidebar shows all upcoming deadlines grouped by date, with:
- Which day they're scheduled on (or "unscheduled" if not assigned to a day)
- Colour-coded category dots
- Overdue group headers highlighted in red

## Late Task Colouring

Tasks with overdue deadlines or assigned dates become increasingly red:

- **1 day late** → subtle orange border
- **2–3 days late** → red border + light red background
- **4–7 days late** → deeper red + inner glow
- **7+ days late** → pulsing deep red

## Category Colours

Each category automatically gets a unique colour from a 15-colour palette (determined by a hash of the category name). The colour appears as:
- A **left border** on the task card
- A **tinted badge** on the task metadata
- A **dot** in the summary and deadlines panels

## Summary Page

Click **📊 Summary** in the navigation bar to see:
- **Overall stats** — total / done / late / pending task counts and time estimates
- **Progress bar** — visual done vs late vs pending breakdown
- **By Category** — table with task counts and time per category
- **This Week** — daily breakdown of tasks and remaining time
- **Upcoming Deadlines** — sorted list of the next 15 deadlines

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `N` | Quick-add a task to today's column |
| `←` | Previous week |
| `→` | Next week |
| `Esc` | Close modal |

## Data Storage

All data lives in `localStorage` under these keys:
- `todo_app_tasks` — array of task objects
- `todo_app_settings` — user preferences

### Task Object Shape

```json
{
  "id": "uuid",
  "title": "Task name",
  "assignedDate": "2026-02-08",
  "deadline": "2026-02-10",
  "estimateMinutes": 30,
  "category": "Work",
  "sortOrder": 1738972800000,
  "done": false,
  "createdAt": "ISO timestamp",
  "completedAt": null
}
```

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
