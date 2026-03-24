# Rewind for AI Chats

[English README](README.md) · [简体中文 README](README.zh-CN.md)

> 一個以本機為核心、沉浸感十足的 AI 對話時光機。 
> 讓你過去在 ChatGPT、Gemini、Claude 與 Grok 上的互動重新鮮活起來。

有時候，我們和 AI 的對話不只是一次次功能性的問答；它們也是思路的軌跡、腦力激盪的過程，還有靈感冒出的瞬間。 
**Rewind** 不只是一個「匯出工具」——它更像是你的個人 AI 對話檔案庫。受到 Spotify Wrapped 與 YouTube Music Recap 那種漂亮的年度回顧體驗啟發，Rewind 會把你分散在不同平台上的 AI 對話彙整起來，並用一個令人驚艷、沉浸感十足的儀表板重新呈現給你。 

透過文字雲、活動趨勢、分支時間軸、跨年份比較，以及你最常聊的主題，重新回顧你的 AI 一年——而且一切都 100% 安全地保存在你的本機上。

## ✨ 功能特色

- 🎬 **可選年份的「Rewind」沉浸式故事模式**：以全螢幕、自動播放的方式呈現你所選年份的 AI 統計（常用平台、對話量、主題亮點等等）。
- 📊 **精美的分析儀表板**：用高質感圖表呈現你的每月訊息趨勢、平台依賴度、文字雲、重點對話，以及跨年份變化。
- 🌳 **支援分支的統一時間軸**：以壯觀的「鳥瞰式」SVG 地圖呈現你具分支結構的 AI 對話演化樹。
- 📚 **強大的對話庫**：可依多種條件篩選的資料表，方便搜尋、排序、收藏與檢視你存檔下來的重要對話（支援日期、平台、附件、收藏，以及正規化後的 metadata）。
- 🖼️ **可分享的 Rewind 卡片**：把你所選年份的 Rewind 匯出成一張整理好的摘要圖片。
- 🔒 **100% 本機優先架構**：你的資料不會離開你的電腦。 
  - **瀏覽器檔案庫**：目前的 Web 版本會把正規化後的對話資料與 metadata 儲存在 `localStorage`。
  - **持久化伺服器**：已預先配置一個本機 API Node 伺服器（`packages/api`），可將你的檔案庫寫入本機 **SQLite** 資料庫。
  - **資料庫位置**：同步後的資料會儲存在你本機檔案系統中的 `packages/db/rewind.sqlite`。
  - **搜尋基礎**：SQLite 層已包含本機全文搜尋基礎，可供後續與 API 查詢使用。
- ⚡ **跨平台 AI 支援**：目前支援 ChatGPT 與 Grok 的 JSON 匯入，以及 ChatGPT / Gemini / Claude / Grok 的 HTML / MHTML 匯入。
- 🚀 **流暢的匯入精靈**：以打磨過的拖放式介面，快速匯入 JSON 匯出檔與原生瀏覽器擷取檔（`.html`、`.htm`、`.mhtml`、`.mht`）。
- ☁️ **已準備好部署到 GitHub Pages 的 Web App**：Web App 現在使用 `HashRouter`，也已包含 Pages 部署 workflow。

## ✅ 功能矩陣

### 核心能力

| 功能 | 狀態 | 說明 |
| --- | --- | --- |
| 沉浸式 Rewind 故事模式 | ✅ | 可選年份、多頁面、支援多語系 |
| Dashboard 分析 | ✅ | 每月活動、平台占比、文字雲、亮點摘要 |
| 年度比較 | ✅ | 所選年份與前一年比較 |
| 對話庫 | ✅ | 搜尋、排序、收藏、附件、metadata 標籤 |
| 可分享摘要卡片 | ✅ | 可把 Rewind 摘要匯出成 PNG |
| 本機瀏覽器檔案庫 | ✅ | 資料本地儲存在 `localStorage` |
| SQLite 同步 | ✅ | 可把匯入檔案同步到本機 API / SQLite |
| 本機搜尋基礎 | ✅ | 已包含 SQLite FTS 搜尋端點 |
| GitHub Pages 部署 | ✅ | HashRouter + workflow 已配置 |

### 來源 / 格式支援

| 來源 | JSON 匯入 | HTML / MHTML 匯入 | 批次匯出腳本 | 建議流程 |
| --- | --- | --- | --- | --- |
| ChatGPT | ✅ | ✅ | ✅ | 使用 userscript 或另存頁面後匯入 |
| Grok | ✅ | ✅ | ✅ | 使用 userscript 或另存頁面後匯入 |

注意：Grok 的另存頁面（HTML / MHTML）匯入只會保留當前可見的 branch，因為儲存頁面本身不包含隱藏 branch 的完整歷史。

| Gemini | — | ✅ | — | 另存網頁 → `.mhtml` |
| Claude | — | ✅ | — | 另存網頁 → `.mhtml` |

## 📸 Screenshots

> 由於 UI/UX 調整相對頻繁，請以 GitHub Pages 或本地部署畫面作為主要參考。這裡的截圖偏向示意用途，不保證永遠與最新介面完全一致。


![Dashboard Overview](docs/screenshots/dashboard-overview.png)
![Rewind Story](docs/screenshots/rewind-story.png)
![Library View](docs/screenshots/library-view.png)
![Timeline View](docs/screenshots/timeline-view.png)
![Highlights View](docs/screenshots/highlights-view.png)

## 🛠️ 在本機執行 App

這個專案目前已現代化為 **React + Vite + Tailwind CSS** 架構。

```bash
# 1. 安裝相依套件
npm install

# 2. 啟動 Vite 開發伺服器
npm run dev:web
```

接著前往 `http://localhost:4173/`，體驗整個 dashboard。

如果你也想啟用本機 SQLite 持久化與搜尋基礎，可以另外啟動本機 API 伺服器：

```bash
npm run dev --workspace @rewind/api
```

這會在 `http://localhost:8765/` 啟動 Rewind Local API，而 dashboard 可透過 **Sync SQLite** 將資料同步進去。

## ☁️ 部署到 GitHub Pages
因為 Web App 使用 `HashRouter`，所以在靜態託管環境下也能安全處理深層連結。

您可以在 GitHub Pages 線上試用此應用程式：[GitHub Pages](https://pme26elvis.github.io/rewind-for-ai-chats/)

## 🕷️ 批次匯出 — 多平台主動爬取工具

若你想一鍵批次匯出 **ChatGPT 或 Grok** 上的所有對話：

1. 在瀏覽器中安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打開 `packages/extension/rewind-batch-export.user.js`，並在 Tampermonkey 中按下 **Install**。
3. 前往 [chatgpt.com](https://chatgpt.com) 或 [grok.com](https://grok.com)。右下角會出現浮動的 **「⚡ Rewind Batch Export」** 面板。
4. 點擊 **「🚀 Start Export」**。腳本會利用你目前的登入 session，透過內部 API 抓取完整的 JSON 對話樹。
5. 解壓縮後，把 `.json` 檔拖進 Rewind 的 **Import Data** 頁面，即可匯入你的檔案庫。

對於 **Gemini** 與 **Claude**，目前建議流程是：

1. 在瀏覽器中打開該對話。
2. 使用 **另存網頁**。
3. 若可選，優先存成 `.mhtml`。
4. 再把該檔案匯入 Rewind。

## 📜 致謝與授權

本專案最初受到 [Yalums/lyra-exporter](https://github.com/Yalums/lyra-exporter)（MIT License）啟發。雖然本專案已大幅把重心從瀏覽器匯出工具，轉向一個獨立、重視美感的本機分析儀表板（也就是「Rewind」體驗），但我們依然對原作者在 AI 聊天 DOM 擷取與通用 JSON 結構映射上的先驅邏輯，保有深深的感謝，並完整致上應有的 credit。
