# Rewind for AI Chats

[English README](README.md) · [繁體中文 README](README.zh-TW.md)

支持 ChatGPT、Grok、Gemini 与 Claude 的 AI 对话本地优先归档与年度回顾工具。

导入导出的 JSON 或已保存的页面文件后，即可在同一处浏览对话，并基于你自己的数据生成 Spotify 风格的年度回顾。

## Demo

- **在线演示：** [GitHub Pages](https://pme26elvis.github.io/rewind-for-ai-chats/)
- **批量导出脚本：** [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js)
- **本地开发：** 参见 [Running Locally](#本地运行)

![Rewind demo](docs/demo/rewind-demo.gif)

## 快速开始

### 方案 A — 从 ChatGPT 或 Grok 批量导出
1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 安装 [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js) 中的 userscript。
3. 打开 [chatgpt.com](https://chatgpt.com) 或 [grok.com](https://grok.com)。
4. 使用 **Rewind Batch Export** 将对话导出为 `.json`。
5. 打开 [GitHub Pages 上的 Rewind](https://pme26elvis.github.io/rewind-for-ai-chats/) 并导入文件。

### 方案 B — 手动保存重要对话
1. 在 ChatGPT、Gemini、Claude 或 Grok 中打开一段对话。
2. 使用浏览器的 **另存为**。
3. 若可选，请保存为 `.mhtml`（部分情况下也支持 `.html` / `.htm`）。
4. 将文件导入 Rewind。

## 概览

AI 对话常常分散在不同平台上，后续也不容易重新查找与回顾。

Rewind 提供一种本地优先的方式，让你能够在同一处收集、整理并查看这些对话。它将归档、浏览、分析与年度回顾整合在同一个应用中。

## 功能

- 导入来自 **ChatGPT、Grok、Gemini 与 Claude** 的对话
- 建立 **本地优先** 的 AI 对话历史归档
- 使用包含元数据、收藏与附件的 **对话资料库视图**
- 探索可展示分支结构的 **统一时间线**
- 查看受 Spotify Wrapped 启发的 **年度回顾**
- 查看用于活动趋势与平台使用情况的 **分析仪表板**
- 导出可分享的 **回顾卡片**
- 可选择将导入数据同步到本地 **SQLite** 数据库

## 功能亮点

### 年度回顾
按年份查看平台占比、活动情况与精选亮点。

### 分析仪表板
提供活动趋势、平台占比、主题信号与年度对比等图表。

### 统一时间线
以单一视图展示分支式对话的结构与历史。

### 对话资料库视图
可浏览、筛选、排序、收藏并查看已归档的对话。

### 可分享的摘要卡片
将回顾快照导出为图片。

### 本地优先架构
你的数据保留在你自己的设备上。

- **浏览器归档：** 导入数据会存储在浏览器本地的 `localStorage`
- **可选本地持久化：** 本地 Node API 可将数据同步到 SQLite
- **数据库路径：** `packages/db/rewind.sqlite`
- **搜索基础：** 已包含 SQLite 全文检索基础，可用于本地查询

## 支持来源与格式

| 来源 | JSON 导入 | HTML / MHTML 导入 | 批量导出脚本 | 推荐流程 |
| --- | --- | --- | --- | --- |
| ChatGPT | ✅ | ✅ | ✅ | Userscript 或保存页面后导入 |
| Grok | ✅ | ✅ | ✅ | Userscript 或保存页面后导入 |
| Gemini | — | ✅ | — | 另存为 → `.mhtml` |
| Claude | — | ✅ | — | 另存为 → `.mhtml` |

> 注意：对于 Grok 的保存页面导入（`.html` / `.mhtml`），由于隐藏分支历史不会包含在保存页面中，因此只会保留当前可见的分支。

## 截图

> UI 仍可能经常变动，请以 GitHub Pages 或你的本地部署版本为准。

![Rewind Story](docs/screenshots/rewind-story.png)
![Timeline View](docs/screenshots/timeline-view.png)

## GitHub Pages

Rewind 已可直接部署为静态站点，并使用 `HashRouter` 以确保在 GitHub Pages 上的深层链接正常工作。

**https://pme26elvis.github.io/rewind-for-ai-chats/**

## 批量导出脚本

若要从 **ChatGPT** 或 **Grok** 批量导出对话：

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [`packages/extension/rewind-batch-export.user.js`](packages/extension/rewind-batch-export.user.js)。
3. 在 Tampermonkey 中点击 **Install**。
4. 访问 [chatgpt.com](https://chatgpt.com) 或 [grok.com](https://grok.com)。
5. 使用浮动的 **Rewind Batch Export** 面板导出归档数据。
6. 将导出的 `.json` 文件导入 Rewind。

对于 **Gemini** 与 **Claude**，当前推荐流程为：

1. 在浏览器中打开该对话
2. 使用 **另存为**
3. 若可选，保存为 `.mhtml`
4. 将文件导入 Rewind

## 本地运行

本项目使用 **React + Vite + Tailwind CSS**。

### 启动 web app

```bash
npm install
npm run dev:web
```

打开：

`http://localhost:4173/`

### 启动用于 SQLite 同步的本地 API

```bash
npm run dev --workspace @rewind/api
```

这会在以下地址启动本地 API：

`http://localhost:8765/`

之后你可以从仪表板使用 **Sync SQLite**，将导入数据持久化到本地数据库。

## 致谢

本项目最初受到 [Yalums/lyra-exporter](https://github.com/Yalums/lyra-exporter)（MIT License）的启发。

Rewind 此后已逐步演进为一个独立的本地归档、分析仪表板与年度回顾工具。对于原作者早期在 AI 对话结构抓取与映射方面的工作，仍致以完整的感谢与敬意。

## 许可

本项目依据本仓库内附带的许可条款发布。
