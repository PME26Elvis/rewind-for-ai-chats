# Rewind for AI Chats

[English README](README.md) · [简体中文 README](README.zh-CN.md)

支援 ChatGPT、Grok、Gemini 與 Claude 的 AI 對話本地優先封存與年度回顧工具。

匯入匯出的 JSON 或已儲存的頁面檔後，即可在同一處瀏覽對話，並根據你自己的資料生成 Spotify 風格的年度回顧。

## Demo

- **線上展示：** [GitHub Pages](https://pme26elvis.github.io/rewind-for-ai-chats/)
- **批次匯出腳本：** [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js)
- **本機開發：** 請見 [Running Locally](#本機執行)

![Rewind demo](docs/demo/rewind-demo.gif)

## 快速開始

### 方案 A — 從 ChatGPT 或 Grok 批次匯出
1. 安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. 安裝 [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js) 中的 userscript。
3. 開啟 [chatgpt.com](https://chatgpt.com) 或 [grok.com](https://grok.com)。
4. 使用 **Rewind Batch Export** 將對話匯出為 `.json`。
5. 開啟 [GitHub Pages 上的 Rewind](https://pme26elvis.github.io/rewind-for-ai-chats/) 並匯入檔案。

### 方案 B — 手動儲存重要對話
1. 在 ChatGPT、Gemini、Claude 或 Grok 中開啟一段對話。
2. 使用瀏覽器的 **另存新檔**。
3. 若可選，請儲存為 `.mhtml`（部分情況也支援 `.html` / `.htm`）。
4. 將檔案匯入 Rewind。

## 概覽

AI 對話常常分散在不同平台上，之後也不容易重新查找與回顧。

Rewind 提供一種本地優先的方式，讓你能在同一個地方收集、整理並檢視這些對話。它將封存、瀏覽、分析與年度回顧整合在同一個應用中。

## 功能

- 匯入來自 **ChatGPT、Grok、Gemini 與 Claude** 的對話
- 建立 **本地優先** 的 AI 對話歷史封存
- 使用含有中繼資料、收藏與附件的 **對話資料庫檢視**
- 探索可呈現分支結構的 **統一時間軸**
- 查看受 Spotify Wrapped 啟發的 **年度回顧**
- 檢視用於活動趨勢與平台使用情況的 **分析儀表板**
- 匯出可分享的 **回顧卡片**
- 可選擇將匯入資料同步到本機 **SQLite** 資料庫

## 功能亮點

### 年度回顧
以年度為單位檢視平台占比、活動情況與精選重點。

### 分析儀表板
提供活動趨勢、平台占比、主題訊號與年度比較等圖表。

### 統一時間軸
以單一視圖呈現分支式對話的結構與歷史。

### 對話資料庫檢視
可瀏覽、篩選、排序、收藏並檢視已封存的對話。

### 可分享的摘要卡片
將回顧快照匯出為圖片。

### 本地優先架構
你的資料保留在你自己的裝置上。

- **瀏覽器封存：** 匯入資料會儲存在瀏覽器本地的 `localStorage`
- **可選本地持久化：** 本機 Node API 可將資料同步至 SQLite
- **資料庫路徑：** `packages/db/rewind.sqlite`
- **搜尋基礎：** 已包含 SQLite 全文檢索基礎，可供本地查詢使用

## 支援來源與格式

| 來源 | JSON 匯入 | HTML / MHTML 匯入 | 批次匯出腳本 | 建議流程 |
| --- | --- | --- | --- | --- |
| ChatGPT | ✅ | ✅ | ✅ | Userscript 或儲存頁面後匯入 |
| Grok | ✅ | ✅ | ✅ | Userscript 或儲存頁面後匯入 |
| Gemini | — | ✅ | — | 另存新檔 → `.mhtml` |
| Claude | — | ✅ | — | 另存新檔 → `.mhtml` |

> 注意：對於 Grok 的儲存頁面匯入（`.html` / `.mhtml`），由於隱藏分支歷史不會包含在儲存頁面中，因此只會保留目前可見的分支。

## 截圖

> UI 仍可能經常變動，請以 GitHub Pages 或你的本機部署版本為準。

![Rewind Story](docs/screenshots/rewind-story.png)
![Timeline View](docs/screenshots/timeline-view.png)

## GitHub Pages

Rewind 已可直接部署為靜態網站，並使用 `HashRouter` 以確保在 GitHub Pages 上的深層連結可正常運作。

**https://pme26elvis.github.io/rewind-for-ai-chats/**

## 批次匯出腳本

若要從 **ChatGPT** 或 **Grok** 批次匯出對話：

1. 安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. 開啟 [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js)。
3. 在 Tampermonkey 中點擊 **Install**。
4. 前往 [chatgpt.com](https://chatgpt.com) 或 [grok.com](https://grok.com)。
5. 使用浮動的 **Rewind Batch Export** 面板匯出封存資料。
6. 將匯出的 `.json` 檔匯入 Rewind。

對於 **Gemini** 與 **Claude**，目前建議流程為：

1. 在瀏覽器中開啟該對話
2. 使用 **另存新檔**
3. 若可選，儲存為 `.mhtml`
4. 將檔案匯入 Rewind

## 本機執行

本專案使用 **React + Vite + Tailwind CSS**。

### 啟動 web app

```bash
npm install
npm run dev:web
```

開啟：

`http://localhost:4173/`

### 啟動用於 SQLite 同步的本機 API

```bash
npm run dev --workspace @rewind/api
```

這會在以下位址啟動本機 API：

`http://localhost:8765/`

之後你可以從儀表板使用 **Sync SQLite**，將匯入資料持久化到本機資料庫。

## 致謝

本專案最初受到 [Yalums/lyra-exporter](https://github.com/Yalums/lyra-exporter)（MIT License）的啟發。

Rewind 此後已逐步演進為一個獨立的本地封存、分析儀表板與年度回顧工具。對原作者早期在 AI 對話結構擷取與映射上的工作，仍致上完整的感謝與敬意。

## 授權

本專案依照此儲存庫內附帶的授權條款釋出。
