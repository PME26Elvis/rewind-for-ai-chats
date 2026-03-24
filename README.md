# Rewind for AI Chats

[繁體中文 README](README.zh-TW.md) · [简体中文 README](README.zh-CN.md)

> A local-first, deeply immersive time machine for your AI conversations. 
> See your past interactions with ChatGPT, Gemini, Claude, and Grok come alive.

Sometimes, our conversations with AI aren't just transactional Q&As; they are trails of thought, brainstorming sessions, and sparks of inspiration. 
**Rewind** is more than just an "export tool"—it's your personal AI conversational archive. Inspired by the beautiful analytics of Spotify Wrapped and YouTube Music Recap, Rewind aggregates your scattered AI chats across multiple platforms and presents them back to you through a breathtaking, immersive dashboard. 

Relive your year of AI with word clouds, activity trends, branching timelines, compare-year insights, and your most-discussed topics—all stored 100% securely on your local machine.

## ✨ Features

- 🎬 **Year-Selectable "Rewind" Immersive Story Mode**: A stunning full-screen, auto-advancing presentation of your AI stats for the selected year (Top Platforms, Conversation Volume, Topic Highlights, and more).
- 📊 **Beautiful Analytics Dashboard**: Highly aesthetic charts visualizing your monthly message trends, platform dependency, word clouds, top conversations, and year-over-year changes.
- 🌳 **Branch-Aware Unified Timeline**: A spectacular "birds-eye view" SVG map showing the evolutionary tree of your branching AI conversations.
- 📚 **Powerful Conversation Library**: A robust, multi-condition filterable data table to search, sort, favorite, and inspect your archived moments (Supports Date, Platform, Attachments, Favorites, and normalized metadata).
- 🖼️ **Shareable Rewind Cards**: Export a polished summary image of your selected Rewind to share or keep.
- 🔒 **100% Local-First Architecture**: Your data never leaves your machine. 
  - **Browser Archive**: The current web build stores normalized conversation data and metadata locally in `localStorage`.
  - **Persistence Server**: A local API Node server (`packages/api`) is pre-configured to ingest your archive into a local **SQLite** database.
  - **Database Location**: Synced data is stored in `packages/db/rewind.sqlite` on your local filesystem.
  - **Search Foundation**: The SQLite layer includes a local full-text-search foundation for future and API-based querying.
- ⚡ **Cross-Platform AI Support**: Rewind currently supports ChatGPT and Grok JSON imports, plus ChatGPT / Gemini / Claude / Grok HTML-MHTML imports.
- 🚀 **Seamless Import Wizard**: A polished drag-and-drop UI to quickly ingest JSON exports and native browser captures (`.html`, `.htm`, `.mhtml`, `.mht`).
- ☁️ **GitHub Pages-Ready Web App**: The web app now uses `HashRouter`, and a Pages deployment workflow is included for static hosting.

## ✅ Feature Matrix

### Core Capabilities

| Capability | Status | Notes |
| --- | --- | --- |
| Immersive Rewind story | ✅ | Year-selectable, multi-slide, localized presentation |
| Dashboard analytics | ✅ | Monthly activity, platform share, word cloud, highlights |
| Compare years | ✅ | Selected year vs. previous year |
| Conversation library | ✅ | Search, sort, favorites, attachments, metadata badges |
| Shareable summary card | ✅ | Export a Rewind snapshot as PNG |
| Local browser archive | ✅ | Stored locally in `localStorage` |
| SQLite sync | ✅ | Sync imported archive to the local API / SQLite database |
| Local search foundation | ✅ | SQLite FTS-backed search endpoint is included |
| GitHub Pages deployment | ✅ | HashRouter + workflow preconfigured |

### Source / Format Support

| Source | JSON Import | HTML / MHTML Import | Batch Export Script | Recommended Workflow |
| --- | --- | --- | --- | --- |
| ChatGPT | ✅ | ✅ | ✅ | Userscript or saved page import |
| Grok | ✅ | ✅ | ✅ | Userscript or saved page import |

Note: For Grok saved-page (HTML / MHTML) imports, only the currently visible branch is preserved because saved pages do not include hidden branch history.

| Gemini | — | ✅ | — | Save Page As → `.mhtml` |
| Claude | — | ✅ | — | Save Page As → `.mhtml` |

## 📸 Screenshots

> UI/UX changes fairly often, so treat GitHub Pages or your local deployment as the source of truth. The screenshots here are illustrative rather than guaranteed to be perfectly up to date.

![Dashboard Overview](docs/screenshots/dashboard-overview.png)
![Rewind Story](docs/screenshots/rewind-story.png)
![Library View](docs/screenshots/library-view.png)
![Timeline View](docs/screenshots/timeline-view.png)
![Highlights View](docs/screenshots/highlights-view.png)

## 🛠️ Running the App Locally

This project has been modernized to run on **React + Vite + Tailwind CSS**.

```bash
# 1. Install dependencies
npm install

# 2. Start the Vite development server
npm run dev:web
```

Navigate to `http://localhost:4173/` to experience the dashboard.

To enable local SQLite persistence and the local search foundation, you can also run the local API server:

```bash
npm run dev --workspace @rewind/api
```

That will start the Rewind Local API at `http://localhost:8765/`, which the dashboard can sync to via **Sync SQLite**.

## ☁️ Deploying to GitHub Pages

A GitHub Pages workflow is already included in `.github/workflows/deploy-pages.yml`.
Because the web app uses `HashRouter`, deep links remain safe on static hosting.

Once the repository is on GitHub:

1. Push the project to your `main` branch.
2. In **Settings → Pages**, choose **GitHub Actions** as the build and deployment source.
3. The included workflow will install dependencies, build the Vite app with the correct base path, and publish `apps/web/dist` to GitHub Pages.

## 🕷️ Batch Export — Multi-Platform Active Crawler

To bulk-export **all** your conversations from **ChatGPT or Grok** in one click:

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open the file `packages/extension/rewind-batch-export.user.js` and click **Install** in Tampermonkey.
3. Navigate to [chatgpt.com](https://chatgpt.com) or [grok.com](https://grok.com). A floating **"⚡ Rewind Batch Export"** panel will appear in the bottom-right corner.
4. Click **"🚀 Start Export"**. The script will authenticate using your existing session and fetch full JSON trees via internal APIs.
5. Unzip and drag the `.json` files into the Rewind **Import Data** page to populate your archive.

For **Gemini** and **Claude**, the recommended workflow right now is:

1. Open the conversation in your browser.
2. Use **Save Page As**.
3. Save as `.mhtml` when available.
4. Import that file into Rewind.

## 📜 Acknowledgements & License

This project was originally inspired by [Yalums/lyra-exporter](https://github.com/Yalums/lyra-exporter) (MIT License). While this project drastically shifts the focus from a browser-extension exporter to a standalone, highly-aesthetic local analytics dashboard (the "Rewind" experience), we retain deep gratitude and full credit to the original author for the pioneering logic behind capturing and mapping AI chat DOMs and generic JSON structures.
