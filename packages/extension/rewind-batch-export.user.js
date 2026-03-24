// ==UserScript==
// @name         Rewind Batch Export (Multi-Platform Active Crawler)
// @namespace    https://github.com/rewind-for-ai-chats
// @version      1.2.1
// @description  Recursively crawls ChatGPT, Grok, and Gemini conversations and downloads them as a ZIP. Supports pause/resume/cancel, partial export, and scoped batch selection.
// @author       elvis
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://grok.com/*
// @match        https://gemini.google.com/*
// @grant        none
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @require      https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    CHATGPT_API: '/backend-api',
    GROK_API: '/rest/app-chat',
    LIST_PAGE_SIZE: 100,
    FETCH_DELAY_MS: 700,
    LIST_DELAY_MS: 300,
    MAX_RETRIES: 3,
    RETRY_BACKOFF_MS: 2000,
    GEMINI_OPEN_DELAY_MS: 1800,
    ZIP_YIELD_EVERY: 5,
  };

  const SCOPE_MODE = {
    ALL: 'all',
    RECENT_COUNT: 'recent_count',
    RECENT_DAYS: 'recent_days',
  };

  const PLATFORM = {
    CHATGPT: 'chatgpt',
    GROK: 'grok',
    GEMINI: 'gemini',
    UNKNOWN: 'unknown',
  };

  let ui = null;
  let activeExporter = null;
  let chatgptTokenCache = null;
  let state = createInitialState();

  function createInitialState() {
    return {
      phase: 'idle',
      platform: PLATFORM.UNKNOWN,
      conversationIds: [],
      totalCount: 0,
      listedCount: 0,
      completedCount: 0,
      currentIndex: 0,
      currentTitle: '',
      isPaused: false,
      isCancelled: false,
      errors: [],
      completedEntries: [],
      scope: { mode: SCOPE_MODE.ALL, value: null },
      currentOpController: null,
      pauseResolvers: [],
      statusNote: '',
      isExportingPartial: false,
      zipProgress: 0,
    };
  }

  function resetRunState() {
    const scope = state.scope;
    const platform = state.platform;
    state = createInitialState();
    state.scope = scope;
    state.platform = platform;
  }

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return PLATFORM.CHATGPT;
    if (host.includes('grok.com')) return PLATFORM.GROK;
    if (host.includes('gemini.google.com')) return PLATFORM.GEMINI;
    return PLATFORM.UNKNOWN;
  }

  function createAbortError(message) {
    try {
      return new DOMException(message || 'Aborted', 'AbortError');
    } catch (_) {
      const err = new Error(message || 'Aborted');
      err.name = 'AbortError';
      return err;
    }
  }

  function isAbortError(err) {
    return !!err && (err.name === 'AbortError' || err.code === 20);
  }

  function registerCurrentOperationController() {
    const controller = new AbortController();
    state.currentOpController = controller;
    return controller;
  }

  function clearCurrentOperationController(controller) {
    if (state.currentOpController === controller) {
      state.currentOpController = null;
    }
  }

  function interruptCurrentOperation(reason) {
    if (state.currentOpController) {
      try {
        state.currentOpController.abort(reason || 'Interrupted');
      } catch (_) {
        state.currentOpController.abort();
      }
      state.currentOpController = null;
    }
  }

  function resolvePauseWaiters() {
    const waiters = state.pauseResolvers.splice(0, state.pauseResolvers.length);
    for (const resolve of waiters) {
      try {
        resolve();
      } catch (_) { }
    }
  }

  async function waitWhilePausedOrCancelled() {
    while (state.isPaused && !state.isCancelled) {
      await new Promise(resolve => state.pauseResolvers.push(resolve));
    }
    if (state.isCancelled) {
      throw createAbortError('Cancelled');
    }
  }

  async function interruptibleDelay(ms) {
    if (!ms || ms <= 0) return;
    const controller = registerCurrentOperationController();
    try {
      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          cleanup();
          resolve();
        }, ms);

        function onAbort() {
          cleanup();
          reject(createAbortError('Interrupted delay'));
        }

        function cleanup() {
          window.clearTimeout(timer);
          controller.signal.removeEventListener('abort', onAbort);
        }

        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
    } finally {
      clearCurrentOperationController(controller);
    }
  }

  async function yieldToUI() {
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  async function fetchResponse(url, options) {
    const controller = registerCurrentOperationController();
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearCurrentOperationController(controller);
    }
  }

  async function fetchJsonWithRetry(url, options, retries) {
    const maxRetries = typeof retries === 'number' ? retries : CONFIG.MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchResponse(url, options);

        if (response.status === 429) {
          if (attempt === maxRetries) {
            throw new Error('HTTP 429');
          }
          const waitMs = CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt);
          setStatusNote(`Rate limited. Retrying in ${(waitMs / 1000).toFixed(1)}s...`);
          await interruptibleDelay(waitMs);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        clearStatusNote();
        return await response.json();
      } catch (err) {
        if (isAbortError(err)) throw err;
        if (attempt === maxRetries) throw err;

        const waitMs = CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt);
        setStatusNote(`Transient error. Retrying in ${(waitMs / 1000).toFixed(1)}s...`);
        await interruptibleDelay(waitMs);
      }
    }

    throw new Error('Unexpected retry failure');
  }

  function setStatusNote(message) {
    state.statusNote = message || '';
    updateUI();
  }

  function clearStatusNote() {
    if (state.statusNote) {
      state.statusNote = '';
      updateUI();
    }
  }

  function sanitizeFileName(name) {
    return String(name || 'Untitled')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 120);
  }

  function safeJsonStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, function (_, current) {
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      if (current instanceof Element) {
        return `[DOMElement ${current.tagName}]`;
      }
      return current;
    }, 2);
  }

  function buildConversationEntry(conv, fullJson) {
    const shortId = (conv.id || '').split('-')[0] || String(conv.id || '').substring(0, 8) || 'unknown';
    const safeName = sanitizeFileName(conv.title || 'Untitled');
    const fileName = `${state.platform}_${shortId}_${safeName}.json`;

    return {
      id: conv.id,
      title: conv.title || 'Untitled',
      update_time: conv.update_time || null,
      create_time: conv.create_time || null,
      fileName,
      content: safeJsonStringify(fullJson),
    };
  }

  function buildManifest(modeLabel) {
    return {
      exportedAt: new Date().toISOString(),
      tool: 'Rewind Batch Export v1.2.1',
      platform: state.platform,
      scope: getScopeSummary(),
      exportMode: modeLabel,
      targetedConversations: state.totalCount,
      successfullyFetched: state.completedEntries.length,
      errors: state.errors,
    };
  }

  async function buildZipBlob(modeLabel) {
    const zip = new JSZip();

    for (let i = 0; i < state.completedEntries.length; i++) {
      const entry = state.completedEntries[i];
      if (!entry || typeof entry.fileName !== 'string') continue;

      const content = typeof entry.content === 'string'
        ? entry.content
        : safeJsonStringify(entry.content);

      zip.file(entry.fileName, content, {
        binary: false,
        compression: 'STORE',
      });

      if ((i + 1) % CONFIG.ZIP_YIELD_EVERY === 0) {
        state.zipProgress = Math.round(((i + 1) / Math.max(state.completedEntries.length, 1)) * 35);
        updateUI();
        await yieldToUI();
      }
    }

    zip.file('_rewind_manifest.json', safeJsonStringify(buildManifest(modeLabel)), {
      binary: false,
      compression: 'STORE',
    });

    state.zipProgress = 40;
    updateUI();
    await yieldToUI();

    return await zip.generateAsync(
      {
        type: 'blob',
        compression: 'STORE',
        streamFiles: true,
      },
      metadata => {
        state.zipProgress = 40 + Math.round((metadata.percent || 0) * 0.6);
        updateUI();
      }
    );
  }

  function buildExportFileName(kind) {
    const dateStr = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
    const suffix = kind === 'partial' ? 'partial_' : '';
    return `rewind_${state.platform}_export_${suffix}${dateStr}.zip`;
  }

  async function exportCompletedOnly() {
    if (!state.isPaused || state.completedEntries.length === 0 || state.isExportingPartial) {
      return;
    }

    state.isExportingPartial = true;
    setStatusNote('Preparing partial export from completed conversations...');
    updateUI();

    try {
      const blob = await buildZipBlob('partial-completed-only');
      saveAs(blob, buildExportFileName('partial'));
      setStatusNote(`Downloaded partial export with ${state.completedEntries.length} completed conversations.`);
    } catch (err) {
      console.error('[Rewind] Partial export failed:', err);
      setStatusNote(`Partial export failed: ${err.message || String(err)}`);
    } finally {
      state.isExportingPartial = false;
      updateUI();
    }
  }

  function parseScopeSelection() {
    const mode = ui.scopeSelect.value;
    let value = null;

    if (mode === SCOPE_MODE.RECENT_COUNT || mode === SCOPE_MODE.RECENT_DAYS) {
      value = Number(ui.scopeValueInput.value);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Please enter a positive number for the selected batch scope.');
      }
      value = Math.floor(value);
    }

    return { mode, value };
  }

  function syncScopeControls() {
    const mode = ui.scopeSelect.value;
    const needsValue = mode === SCOPE_MODE.RECENT_COUNT || mode === SCOPE_MODE.RECENT_DAYS;

    ui.scopeValueWrap.style.display = needsValue ? 'flex' : 'none';
    ui.scopeValueInput.disabled = !needsValue;

    if (mode === SCOPE_MODE.RECENT_COUNT) {
      ui.scopeValueLabel.textContent = 'n';
      ui.scopeValueInput.placeholder = 'e.g. 50';
    } else if (mode === SCOPE_MODE.RECENT_DAYS) {
      ui.scopeValueLabel.textContent = 'days';
      ui.scopeValueInput.placeholder = 'e.g. 30';
    }
  }

  function getScopeSummary() {
    if (state.scope.mode === SCOPE_MODE.RECENT_COUNT) {
      return `Recent ${state.scope.value} conversations`;
    }
    if (state.scope.mode === SCOPE_MODE.RECENT_DAYS) {
      return `Updated in last ${state.scope.value} days`;
    }
    return 'All conversations';
  }

  function discardProgressForCancel() {
    state.conversationIds = [];
    state.totalCount = 0;
    state.listedCount = 0;
    state.completedCount = 0;
    state.currentIndex = 0;
    state.currentTitle = '';
    state.errors = [];
    state.completedEntries = [];
    state.zipProgress = 0;
    clearStatusNote();
  }

  function pauseExport() {
    if (!(state.phase === 'preparing' || state.phase === 'listing' || state.phase === 'fetching')) {
      return;
    }
    if (state.isPaused) return;
    state.isPaused = true;
    interruptCurrentOperation('Paused');
    updateUI();
  }

  function resumeExport() {
    if (!state.isPaused) return;
    state.isPaused = false;
    resolvePauseWaiters();
    clearStatusNote();
    updateUI();
  }

  function cancelExport() {
    if (!(state.phase === 'preparing' || state.phase === 'listing' || state.phase === 'fetching' || state.isPaused)) {
      return;
    }
    state.isCancelled = true;
    state.isPaused = false;
    resolvePauseWaiters();
    interruptCurrentOperation('Cancelled');
    updateUI();
  }

  class ChatGPTExporter {
    async getAccessToken() {
      if (chatgptTokenCache) return chatgptTokenCache;
      const response = await fetchResponse('/api/auth/session', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Session fetch failed: ${response.status}`);
      }
      const data = await response.json();
      if (!data.accessToken) {
        throw new Error('No accessToken found in session. Are you logged in?');
      }
      chatgptTokenCache = data.accessToken;
      return chatgptTokenCache;
    }

    async listConversations(scope, onProgress) {
      const token = await this.getAccessToken();
      const ids = [];
      const cutoffSeconds = scope.mode === SCOPE_MODE.RECENT_DAYS
        ? (Date.now() / 1000) - (scope.value * 86400)
        : null;
      let offset = 0;

      while (!state.isCancelled) {
        await waitWhilePausedOrCancelled();

        const url = `${CONFIG.CHATGPT_API}/conversations?offset=${offset}&limit=${CONFIG.LIST_PAGE_SIZE}&order=updated`;
        const data = await fetchJsonWithRetry(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });

        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) break;

        let stopAfterPage = false;
        for (const item of items) {
          const updatedAt = Number(item.update_time || item.create_time || 0);
          if (cutoffSeconds !== null && updatedAt > 0 && updatedAt < cutoffSeconds) {
            stopAfterPage = true;
            break;
          }

          ids.push({
            id: item.id,
            title: item.title || 'Untitled',
            create_time: item.create_time || null,
            update_time: item.update_time || null,
          });

          if (scope.mode === SCOPE_MODE.RECENT_COUNT && ids.length >= scope.value) {
            stopAfterPage = true;
            break;
          }
        }

        onProgress(ids.length);
        if (stopAfterPage || items.length < CONFIG.LIST_PAGE_SIZE) break;

        offset += items.length;
        await interruptibleDelay(CONFIG.LIST_DELAY_MS);
      }

      return ids;
    }

    async fetchConversation(conv) {
      const token = await this.getAccessToken();
      return await fetchJsonWithRetry(`${CONFIG.CHATGPT_API}/conversation/${conv.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
    }
  }

  class GrokExporter {
    async listConversations(scope, onProgress) {
      const data = await fetchJsonWithRetry(`${CONFIG.GROK_API}/conversations`, {
        credentials: 'include',
      });

      const items = Array.isArray(data.conversations) ? data.conversations : [];
      const ids = [];
      const cutoffMs = scope.mode === SCOPE_MODE.RECENT_DAYS
        ? Date.now() - (scope.value * 86400 * 1000)
        : null;

      for (const item of items) {
        await waitWhilePausedOrCancelled();

        const rawUpdated = item.updatedAt || item.updateTime || item.createTime || item.createdAt || null;
        const updatedAt = rawUpdated ? new Date(rawUpdated).getTime() : 0;

        if (cutoffMs !== null && updatedAt > 0 && updatedAt < cutoffMs) {
          break;
        }

        ids.push({
          id: item.conversationId || item.id,
          title: item.title || 'Untitled',
          create_time: item.createTime || item.createdAt || null,
          update_time: rawUpdated || null,
        });

        onProgress(ids.length);

        if (scope.mode === SCOPE_MODE.RECENT_COUNT && ids.length >= scope.value) {
          break;
        }
      }

      return ids;
    }

    async fetchConversation(conv) {
      const nodeData = await fetchJsonWithRetry(`${CONFIG.GROK_API}/conversations/${conv.id}/response-node?includeThreads=true`, {
        credentials: 'include',
      });

      const responseIds = Array.isArray(nodeData.responseNodes)
        ? nodeData.responseNodes.map(node => node.responseId).filter(Boolean)
        : [];

      let contentData = {};
      if (responseIds.length > 0) {
        contentData = await fetchJsonWithRetry(`${CONFIG.GROK_API}/conversations/${conv.id}/load-responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responseIds }),
          credentials: 'include',
        });
      }

      return {
        platform: 'grok',
        conversationId: conv.id,
        title: conv.title,
        ...nodeData,
        ...contentData,
      };
    }
  }

  class GeminiExporter {
    getConversationTitle() {
      const candidates = [
        '[data-test-id="conversation-title"]',
        '.conversation-title-column [data-test-id="conversation-title"]',
        'h1',
        'title'
      ];

      for (const selector of candidates) {
        const node = selector === 'title' ? document.querySelector('title') : document.querySelector(selector);
        const text = (node?.textContent || '').trim();
        if (text && !/^google gemini$/i.test(text)) return text;
      }

      return document.title && !/^google gemini$/i.test(document.title) ? document.title.trim() : 'Gemini Chat';
    }

    getConversationHref(element) {
      if (!element) return '';
      if (element.tagName?.toLowerCase() === 'a' && element.getAttribute('href')) return element.getAttribute('href') || '';
      const anchor = element.closest('a[href]') || element.querySelector?.('a[href]');
      return anchor?.getAttribute('href') || '';
    }

    collectSidebarNodes() {
      const selectors = [
        'a[href*="/app/"]',
        'a[href*="/chat/"]',
        '[role="link"]',
        'nav a',
        'aside a'
      ];

      const seen = new Set();
      const nodes = [];
      for (const el of Array.from(document.querySelectorAll(selectors.join(',')))) {
        const href = this.getConversationHref(el);
        if (!href || (!href.includes('/app/') && !href.includes('/chat/'))) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        nodes.push(el);
      }

      return nodes;
    }

    async listConversations(scope, onProgress) {
      const nodes = this.collectSidebarNodes();
      const ids = [];
      const seenIds = new Set();

      for (let i = 0; i < nodes.length; i += 1) {
        await waitWhilePausedOrCancelled();

        const el = nodes[i];
        const href = this.getConversationHref(el);
        const id = href.split('/').filter(Boolean).pop() || `gemini_${i + 1}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const title = (el.textContent || '').trim() || `Gemini Chat ${i + 1}`;
        ids.push({ id, title, href, element: el });
        onProgress(ids.length);

        if (scope.mode === SCOPE_MODE.RECENT_COUNT && ids.length >= scope.value) break;
      }

      if (ids.length === 0) {
        const currentId = window.location.pathname.split('/').filter(Boolean).pop() || `gemini_${Date.now()}`;
        ids.push({
          id: currentId,
          title: this.getConversationTitle(),
          href: window.location.pathname + window.location.search,
          element: null,
        });
        onProgress(ids.length);
      }

      return ids;
    }

    async openConversation(conv) {
      const targetHref = conv.href || (conv.element ? this.getConversationHref(conv.element) : '');
      if (!targetHref) return;

      if (conv.element && typeof conv.element.click === 'function') {
        conv.element.click();
      } else if (window.location.pathname + window.location.search !== targetHref) {
        window.location.href = targetHref;
      }

      await interruptibleDelay(CONFIG.GEMINI_OPEN_DELAY_MS);

      let attempts = 0;
      while (attempts < 8 && !document.querySelector('user-query, message-content, .model-response-text, .markdown-main-panel')) {
        await interruptibleDelay(500);
        attempts += 1;
      }
    }

    collectMessages() {
      const messages = [];
      const seen = new Set();
      const nodes = Array.from(document.querySelectorAll('user-query, message-content'));

      for (const node of nodes) {
        const tag = (node.tagName || '').toLowerCase();
        let role = '';
        let text = '';

        if (tag === 'user-query') {
          role = 'user';
          const contentNode = node.querySelector('.query-content, [id^="user-query-content-"], .user-query-container') || node;
          text = (contentNode.innerText || contentNode.textContent || '').trim();
          text = text.replace(/copy prompt/gi, '').replace(/複製提示詞/g, '').trim();
        } else if (tag === 'message-content') {
          role = 'assistant';
          const contentNode = node.querySelector('.markdown-main-panel, .model-response-text, .markdown') || node;
          text = (contentNode.innerText || contentNode.textContent || '').trim();
        }

        if (!role || !text) continue;
        const key = `${role}:${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push({ role, text });
      }

      return messages;
    }

    async fetchConversation(conv) {
      await this.openConversation(conv);
      const messages = this.collectMessages();

      return {
        platform: 'gemini',
        conversationId: conv.id,
        title: this.getConversationTitle() || conv.title,
        exportedAt: new Date().toISOString(),
        messages,
      };
    }
  }

  function getExporter(platform) {
    if (platform === PLATFORM.CHATGPT) return new ChatGPTExporter();
    if (platform === PLATFORM.GROK) return new GrokExporter();
    if (platform === PLATFORM.GEMINI) return new GeminiExporter();
    return null;
  }

  async function downloadFinalZip() {
    state.phase = 'zipping';
    state.zipProgress = 0;
    clearStatusNote();
    updateUI();

    const blob = await buildZipBlob('final');
    saveAs(blob, buildExportFileName('final'));

    state.phase = 'done';
    state.zipProgress = 100;
    updateUI();
  }

  async function startExport() {
    if (state.phase === 'preparing' || state.phase === 'listing' || state.phase === 'fetching' || state.phase === 'zipping' || state.isExportingPartial) {
      return;
    }

    try {
      const platform = detectPlatform();
      if (platform === PLATFORM.UNKNOWN) {
        throw new Error('Unsupported platform');
      }

      activeExporter = getExporter(platform);
      chatgptTokenCache = null;

      state.platform = platform;
      state.scope = parseScopeSelection();
      resetRunState();
      state.phase = 'preparing';
      updateUI();

      state.phase = 'listing';
      state.conversationIds = await activeExporter.listConversations(state.scope, count => {
        state.listedCount = count;
        updateUI();
      });
      state.totalCount = state.conversationIds.length;
      updateUI();

      if (state.isCancelled) throw createAbortError('Cancelled');

      if (state.totalCount === 0) {
        state.phase = 'done';
        setStatusNote('No conversations matched the selected scope.');
        updateUI();
        return;
      }

      state.phase = 'fetching';
      updateUI();

      let index = 0;
      while (index < state.conversationIds.length) {
        const conv = state.conversationIds[index];
        state.currentIndex = index;
        state.currentTitle = conv.title || 'Untitled';
        updateUI();

        try {
          await waitWhilePausedOrCancelled();
          const fullJson = await activeExporter.fetchConversation(conv);
          state.completedEntries.push(buildConversationEntry(conv, fullJson));
          state.completedCount += 1;
          index += 1;
          clearStatusNote();
          updateUI();

          if (index < state.conversationIds.length) {
            await interruptibleDelay(CONFIG.FETCH_DELAY_MS);
          }
        } catch (err) {
          if (isAbortError(err)) {
            if (state.isCancelled) throw err;
            continue;
          }

          console.error(`[Rewind] Failed to fetch conversation ${conv.id}:`, err);
          state.errors.push({
            id: conv.id,
            title: conv.title || 'Untitled',
            error: err.message || String(err),
          });
          index += 1;
          clearStatusNote();
          updateUI();
        }
      }

      if (state.isCancelled) throw createAbortError('Cancelled');
      await downloadFinalZip();
    } catch (err) {
      if (isAbortError(err) && state.isCancelled) {
        discardProgressForCancel();
        state.phase = 'cancelled';
        state.isCancelled = false;
        updateUI();
        return;
      }

      console.error('[Rewind] Export failed:', err);
      state.phase = 'error';
      state.currentTitle = err.message || String(err);
      updateUI();
    }
  }

  function createButton(label, className, onClick, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.disabled = !!disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  function setControlsDisabled(disabled) {
    ui.scopeSelect.disabled = disabled;
    ui.scopeValueInput.disabled = disabled || ui.scopeValueWrap.style.display === 'none';
  }

  function renderButtons() {
    ui.buttons.innerHTML = '';

    if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'cancelled' || state.phase === 'error') {
      const label = state.phase === 'idle' ? '🚀 Start Export' : '🔄 Start Again';
      ui.buttons.appendChild(createButton(label, 'rw-btn-primary', startExport, false));
      return;
    }

    if (state.phase === 'preparing' || state.phase === 'listing' || state.phase === 'fetching') {
      if (state.phase !== 'preparing') {
        ui.buttons.appendChild(createButton(state.isPaused ? '▶ Resume' : '⏸ Pause', 'rw-btn-secondary', state.isPaused ? resumeExport : pauseExport, state.isExportingPartial));

        if (state.isPaused && state.completedEntries.length > 0) {
          ui.buttons.appendChild(createButton('📦 Export Completed', 'rw-btn-primary', exportCompletedOnly, state.isExportingPartial));
        }
      }

      ui.buttons.appendChild(createButton('✖ Cancel', 'rw-btn-danger', cancelExport, state.isExportingPartial));
      return;
    }

    if (state.phase === 'zipping') {
      ui.buttons.appendChild(createButton('Processing...', 'rw-btn-secondary', function () { }, true));
    }
  }

  function buildStatusText() {
    if (state.phase === 'idle') {
      return 'Ready to export.';
    }
    if (state.phase === 'preparing') {
      return 'Preparing...';
    }
    if (state.phase === 'listing') {
      return `Listing conversations... (${state.listedCount} found)`;
    }
    if (state.phase === 'fetching') {
      const progressPercent = state.totalCount > 0 ? Math.round((state.currentIndex / state.totalCount) * 100) : 0;
      return `Fetching: ${state.currentTitle} (${progressPercent}%)`;
    }
    if (state.phase === 'zipping') {
      return `Bundling ZIP... (${state.zipProgress}%)`;
    }
    if (state.phase === 'done') {
      return 'Export complete!';
    }
    if (state.phase === 'cancelled') {
      return 'Export cancelled.';
    }
    if (state.phase === 'error') {
      return 'Export failed.';
    }
    return '';
  }

  function updateProgressBar() {
    let pct = 0;

    if (state.phase === 'fetching') {
      pct = state.totalCount > 0 ? Math.round((state.completedCount / state.totalCount) * 100) : 0;
    } else if (state.phase === 'zipping') {
      pct = Math.max(1, Math.min(100, state.zipProgress));
    } else if (state.phase === 'done' && state.totalCount > 0) {
      pct = 100;
    } else if (state.phase === 'listing') {
      if (state.scope.mode === SCOPE_MODE.RECENT_COUNT && state.scope.value > 0) {
        pct = Math.min(100, Math.round((state.listedCount / state.scope.value) * 100));
      } else {
        pct = state.listedCount > 0 ? 8 : 0;
      }
    }

    ui.progress.style.width = `${pct}%`;
  }

  function updateCounts() {
    if (state.phase === 'listing') {
      ui.count.textContent = `${state.listedCount} found`;
    } else if (state.phase === 'fetching' || state.phase === 'zipping' || state.phase === 'done') {
      ui.count.textContent = `${state.completedCount} / ${state.totalCount}`;
    } else {
      ui.count.textContent = '0 / 0';
    }

    ui.errors.textContent = state.errors.length > 0 ? `⚠ ${state.errors.length} error(s)` : '';
  }

  function updateUI() {
    if (!ui) return;

    ui.status.textContent = buildStatusText();
    if (state.statusNote) {
      const note = document.createElement('div');
      note.style.fontSize = '11px';
      note.style.marginTop = '4px';
      note.style.color = '#f9e2af';
      note.textContent = state.statusNote;
      ui.status.appendChild(note);
    }

    const progressValue = state.phase === 'zipping' ? state.zipProgress : (state.totalCount > 0 ? (state.currentIndex / state.totalCount) * 100 : 0);
    ui.progress.style.width = `${progressValue}%`;
    ui.count.textContent = `Completed: ${state.completedCount} / ${state.totalCount}`;
    ui.errors.textContent = `Errors: ${state.errors.length}`;

    setControlsDisabled(state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'cancelled' && state.phase !== 'error');
    renderButtons();
  }

  function createUI() {
    if (document.getElementById('rewind-export-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'rewind-export-panel';

    const style = document.createElement('style');
    style.textContent = `
      #rewind-export-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        width: 390px;
        max-width: calc(100vw - 32px);
        background: #1e1e2e;
        color: #cdd6f4;
        border: 1px solid #45475a;
        border-radius: 16px;
        padding: 18px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        font-size: 13px;
      }
      #rewind-export-panel h3 {
        margin: 0 0 12px;
        font-size: 15px;
        color: #cba6f7;
      }
      #rewind-export-panel .rw-status {
        color: #a6adc8;
        margin-bottom: 10px;
        min-height: 38px;
        line-height: 1.4;
      }
      #rewind-export-panel .rw-scope {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }
      #rewind-export-panel .rw-scope label {
        display: block;
        font-size: 11px;
        color: #6c7086;
        margin-bottom: 4px;
      }
      #rewind-export-panel select,
      #rewind-export-panel input {
        width: 100%;
        box-sizing: border-box;
        background: #11111b;
        color: #cdd6f4;
        border: 1px solid #45475a;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        outline: none;
      }
      #rewind-export-panel .rw-scope-value-wrap {
        display: none;
        align-items: center;
        gap: 8px;
      }
      #rewind-export-panel .rw-scope-value-wrap span {
        min-width: 28px;
        font-size: 12px;
        color: #a6adc8;
      }
      #rewind-export-panel .rw-progress-bar {
        width: 100%;
        height: 8px;
        background: #313244;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 10px;
      }
      #rewind-export-panel .rw-progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #89b4fa, #cba6f7);
        border-radius: 4px;
        transition: width 0.25s ease;
      }
      #rewind-export-panel .rw-stats {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 11px;
        color: #6c7086;
        margin-bottom: 12px;
      }
      #rewind-export-panel .rw-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #rewind-export-panel button {
        flex: 1 1 0;
        min-width: 0;
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #rewind-export-panel button:hover:enabled {
        transform: translateY(-1px);
      }
      #rewind-export-panel button:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }
      #rewind-export-panel .rw-btn-primary {
        background: #89b4fa;
        color: #1e1e2e;
      }
      #rewind-export-panel .rw-btn-secondary {
        background: #313244;
        color: #cdd6f4;
      }
      #rewind-export-panel .rw-btn-danger {
        background: #f38ba8;
        color: #1e1e2e;
      }
    `;

    const title = document.createElement('h3');
    title.textContent = '⚡ Rewind Batch Export';

    const status = document.createElement('div');
    status.className = 'rw-status';

    const scopeWrap = document.createElement('div');
    scopeWrap.className = 'rw-scope';

    const scopeTypeWrap = document.createElement('div');
    const scopeTypeLabel = document.createElement('label');
    scopeTypeLabel.textContent = 'Batch scope';
    const scopeSelect = document.createElement('select');
    scopeSelect.innerHTML = `
      <option value="all">All conversations</option>
      <option value="recent_count">Recent n conversations</option>
      <option value="recent_days">Updated in last n days</option>
    `;
    scopeTypeWrap.appendChild(scopeTypeLabel);
    scopeTypeWrap.appendChild(scopeSelect);

    const scopeValueWrap = document.createElement('div');
    scopeValueWrap.className = 'rw-scope-value-wrap';
    const scopeValueLabel = document.createElement('span');
    scopeValueLabel.textContent = 'n';
    const scopeValueInput = document.createElement('input');
    scopeValueInput.type = 'number';
    scopeValueInput.min = '1';
    scopeValueInput.step = '1';
    scopeValueInput.placeholder = 'e.g. 50';
    scopeValueWrap.appendChild(scopeValueLabel);
    scopeValueWrap.appendChild(scopeValueInput);

    scopeWrap.appendChild(scopeTypeWrap);
    scopeWrap.appendChild(scopeValueWrap);

    const progressBar = document.createElement('div');
    progressBar.className = 'rw-progress-bar';
    const progress = document.createElement('div');
    progress.className = 'rw-progress-fill';
    progressBar.appendChild(progress);

    const stats = document.createElement('div');
    stats.className = 'rw-stats';
    const count = document.createElement('span');
    const errors = document.createElement('span');
    stats.appendChild(count);
    stats.appendChild(errors);

    const buttons = document.createElement('div');
    buttons.className = 'rw-buttons';

    panel.appendChild(style);
    panel.appendChild(title);
    panel.appendChild(status);
    panel.appendChild(scopeWrap);
    panel.appendChild(progressBar);
    panel.appendChild(stats);
    panel.appendChild(buttons);
    (document.body || document.documentElement).appendChild(panel);

    ui = {
      panel,
      status,
      scopeSelect,
      scopeValueWrap,
      scopeValueLabel,
      scopeValueInput,
      progress,
      count,
      errors,
      buttons,
    };

    scopeSelect.addEventListener('change', syncScopeControls);
    syncScopeControls();
    state.platform = detectPlatform();
    updateUI();
  }

  function installSpaHooks() {
    if (window.__rewindSpaHooksInstalled) return;
    window.__rewindSpaHooksInstalled = true;

    const rerender = () => setTimeout(() => {
      if (detectPlatform() !== PLATFORM.UNKNOWN && !document.getElementById('rewind-export-panel')) {
        createUI();
      }
    }, 300);

    const originalPushState = history.pushState;
    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      rerender();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      rerender();
      return result;
    };

    window.addEventListener('popstate', rerender);
    window.addEventListener('hashchange', rerender);
  }

  function init() {
    if (detectPlatform() === PLATFORM.UNKNOWN) return;
    if (!document.body && !document.documentElement) return;

    createUI();
    installSpaHooks();

    const observer = new MutationObserver(() => {
      if (detectPlatform() !== PLATFORM.UNKNOWN && !document.getElementById('rewind-export-panel')) {
        createUI();
      }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

    setInterval(() => {
      if (detectPlatform() !== PLATFORM.UNKNOWN && !document.getElementById('rewind-export-panel')) {
        createUI();
      }
    }, 2000);

    console.log('[Rewind] Multi-platform batch export userscript initialized.');
  }

  // Handle both initial load and SPA transitions where possible
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

  // For SPAs that might load content much later
  window.addEventListener('load', init);
})();