# Rewind for AI Chats

[繁體中文 README](README.zh-TW.md) · [简体中文 README](README.zh-CN.md)

Local-first archive and yearly recap for AI chats across ChatGPT, Grok, Gemini, and Claude.

Import exported JSON or saved pages, browse conversations in one place, and generate a Spotify-style rewind from your own data.

## Demo

- **Live Demo:** [GitHub Pages](https://pme26elvis.github.io/rewind-for-ai-chats/)
- **Batch Export Script:** [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js)
- **Local Development:** See [Running Locally](#running-locally)

![Rewind demo](docs/demo/rewind-demo.gif)

## Quick Start

### Option A — Bulk export from ChatGPT or Grok
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Install the userscript from [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js).
3. Open [chatgpt.com](https://chatgpt.com) or [grok.com](https://grok.com).
4. Use **Rewind Batch Export** to export conversations as `.json`.
5. Open [Rewind on GitHub Pages](https://pme26elvis.github.io/rewind-for-ai-chats/) and import the files.

### Option B — Save important chats manually
1. Open a conversation in ChatGPT, Gemini, Claude, or Grok.
2. Use **Save Page As** in your browser.
3. Save as `.mhtml` when available (`.html` / `.htm` also supported in some cases).
4. Import the file into Rewind.

## Overview

AI conversations are often scattered across multiple platforms and difficult to revisit later.

Rewind provides a local-first way to collect, organize, and review them in one place. It combines archival, browsing, analytics, and yearly recap in a single app.

## Features

- Import conversations from **ChatGPT, Grok, Gemini, and Claude**
- Build a **local-first archive** of AI chat history
- Browse a **conversation library** with metadata, favorites, and attachments
- Explore a **unified timeline** of branching conversations
- View a **yearly rewind** inspired by Spotify Wrapped
- Inspect **analytics dashboards** for activity trends and platform usage
- Export **shareable rewind cards**
- Optionally sync imported data into a local **SQLite** database

## Feature Highlights

### Yearly Rewind
Yearly recap view with platform mix, activity, and highlights.

### Analytics Dashboard
Charts for activity trends, platform share, topic signals, and year-over-year comparison.

### Unified Timeline
A single view for branching conversation structure and history.

### Conversation Library
Browse, filter, sort, favorite, and inspect archived conversations.

### Shareable Summary Cards
Export rewind snapshots as images.

### Local-First Architecture
Your data stays on your machine.

- **Browser archive:** Imported data is stored locally in `localStorage`
- **Optional local persistence:** A local Node API can sync data into SQLite
- **Database path:** `packages/db/rewind.sqlite`
- **Search foundation:** SQLite full-text-search groundwork is included for local querying

## Supported Sources and Formats

| Source | JSON Import | HTML / MHTML Import | Batch Export Script | Recommended Workflow |
| --- | --- | --- | --- | --- |
| ChatGPT | ✅ | ✅ | ✅ | Userscript or saved page import |
| Grok | ✅ | ✅ | ✅ | Userscript or saved page import |
| Gemini | — | ✅ | — | Save Page As → `.mhtml` |
| Claude | — | ✅ | — | Save Page As → `.mhtml` |

> Note: For Grok saved-page imports (`.html` / `.mhtml`), only the currently visible branch is preserved because hidden branch history is not included in saved pages.

## Screenshots

> UI changes fairly often. Treat GitHub Pages or your local deployment as the source of truth.

![Rewind Story](docs/screenshots/rewind-story.png)
![Timeline View](docs/screenshots/timeline-view.png)

## GitHub Pages

Rewind is ready for static hosting and uses `HashRouter` for safe deep-linking on GitHub Pages.

**https://pme26elvis.github.io/rewind-for-ai-chats/**

## Batch Export Script

To bulk-export conversations from **ChatGPT** or **Grok**:

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js).
3. Click **Install** in Tampermonkey.
4. Visit [chatgpt.com](https://chatgpt.com) or [grok.com](https://grok.com).
5. Use the floating **Rewind Batch Export** panel to export your archive.
6. Import the exported `.json` files into Rewind.

For **Gemini** and **Claude**, the current workflow is:

1. Open the conversation in your browser
2. Use **Save Page As**
3. Save as `.mhtml` when available
4. Import the file into Rewind

## Running Locally

This project uses **React + Vite + Tailwind CSS**.

### Start the web app

```bash
npm install
npm run dev:web
```

Open:

`http://localhost:4173/`

### Start the local API for SQLite sync

```bash
npm run dev --workspace @rewind/api
```

This starts the local API at:

`http://localhost:8765/`

You can then use **Sync SQLite** from the dashboard to persist imported data into your local database.

## Acknowledgements

This project was originally inspired by [Yalums/lyra-exporter](https://github.com/Yalums/lyra-exporter) (MIT License).

Rewind has since evolved toward a standalone local archive, analytics dashboard, and yearly recap experience. Full credit and appreciation remain with the original author for the early work on capturing and mapping AI chat structures.

## License

This project is released under the terms of the license included in this repository.

