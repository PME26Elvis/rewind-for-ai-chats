import { runImportWizard, createWizardSnapshot, computeRewindAnalytics } from '../../../../packages/core/src/index.js';

const SOURCES_KEY = 'rewind:selected-import-sources';
const LEGACY_SOURCES_KEY = 'rewind:selected-json-sources';
const ARCHIVE_KEY = 'rewind:browser-archive';
const LEGACY_LIBRARY_KEY = 'rewind_mock_data';
const LEGACY_FULL_KEY = 'rewind_full_chats';
const ARCHIVE_EVENT = 'rewind:archive-updated';
const ARCHIVE_SCHEMA_VERSION = 2;
const DEFAULT_API_BASE = 'http://localhost:8765';
let selectedSourcesMemory = [];
let archiveMemoryCache = null;
let archivePersistTimer = null;
const GENERIC_TITLES = new Set(['chatgpt', 'grok', 'google gemini', 'google gemini app', 'claude', 'untitled', '(untitled)']);
const SEARCH_STOPWORDS = new Set(['the','and','for','with','that','this','from','into','about','have','your','what','when','where','which','would','could','should','there','their','will','just','like','than','then','them','they','chatgpt','gemini','claude','grok','build','using','more','need','want','help','how','why','you','are','was','were','has','had','can','not','all','our','out','use','used','one','two']);

const CHATGPT_TOOL_CONTENT_TYPES = new Set(['code', 'tool_result', 'tether_browsing_search_result']);

function normalizeWhitespace(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripAssistantCitationTokens(value) {
  return String(value || '')
    .replace(/cite[^]+/g, '')
    .replace(/filecite[^]+/g, '')
    .replace(/(?:forecast|schedule|standing|finance)[^]+/g, '')
    .trim();
}

function applyChatgptContentReferences(text, metadata) {
  if (!text) return '';
  const refs = Array.isArray(metadata?.content_references) ? metadata.content_references : [];
  let result = String(text);
  const sorted = refs
    .filter((ref) => ref && ref.matched_text && ref.alt)
    .sort((a, b) => String(b.matched_text).length - String(a.matched_text).length);
  for (const ref of sorted) {
    result = result.split(ref.matched_text).join(ref.alt);
  }
  return stripAssistantCitationTokens(result);
}

function buildConversationFingerprint(entry) {
  const raw = entry?.rawJson || {};
  const platform = normalizePlatformName(entry?.platform || raw?.platform || 'chatgpt');
  const conversationId = raw?.conversationId || raw?.conversation_id || raw?.uuid || raw?.id || '';
  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  const firstText = messages[0]?.text || messages[0]?.content || '';
  const lastText = messages.length > 0 ? (messages[messages.length - 1]?.text || messages[messages.length - 1]?.content || '') : '';
  return [platform, conversationId || cleanTitle(entry?.title, entry?.sourceFile || entry?.title || ''), messages.length || entry?.msgCount || 0, String(firstText).slice(0, 120), String(lastText).slice(0, 120)].join('::');
}

function buildConversationIdentity(entry) {
  const raw = entry?.rawJson || {};
  const platform = normalizePlatformName(entry?.platform || raw?.platform || 'chatgpt');
  const conversationId = raw?.conversationId || raw?.conversation_id || raw?.uuid || raw?.id || entry?.conversationId || '';
  if (conversationId) return `${platform}::${String(conversationId)}`;
  return `${platform}::${cleanTitle(entry?.title, entry?.sourceFile || entry?.title || '').toLowerCase()}`;
}

function exportConversationAsRewind(detail) {
  return {
    schema: 'rewind-export/v1',
    title: detail?.conversation?.title || 'Untitled conversation',
    platform: normalizePlatformName(detail?.conversation?.platform),
    conversationId: detail?.conversation?.id,
    createdAt: detail?.conversation?.createdAt,
    updatedAt: detail?.conversation?.updatedAt || detail?.conversation?.importedAt,
    sourceFormat: 'rewind-export',
    messages: (detail?.messages || []).map((message) => ({
      id: message.id,
      role: normalizeRole(message.role),
      text: message.text || '',
      thinking: message.thinking || '',
      createdAt: message.createdAt,
      model: message.model
    }))
  };
}

function readJson(key, fallback) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Ignore quota / serialization failures for optional browser cache state.
  }
}


function scheduleArchivePersist(snapshot) {
  archiveMemoryCache = snapshot;
  if (archivePersistTimer) return;
  archivePersistTimer = window.setTimeout(() => {
    archivePersistTimer = null;
    writeJson(ARCHIVE_KEY, archiveMemoryCache);
  }, 0);
}

function dispatchArchiveUpdated(snapshot) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(ARCHIVE_EVENT, { detail: { snapshot } }));
  }
}

export function createEmptyArchive() {
  return { __meta: { normalizedVersion: ARCHIVE_SCHEMA_VERSION }, accounts: {}, conversations: {}, branches: {}, messages: {}, importJobs: {} };
}

function normalizePlatformName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('chatgpt') || normalized === 'openai') return 'chatgpt';
  if (normalized.includes('gemini') || normalized.includes('bard')) return 'gemini';
  if (normalized.includes('claude') || normalized.includes('anthropic')) return 'claude';
  if (normalized.includes('grok') || normalized.includes('xai')) return 'grok';
  return normalized || 'chatgpt';
}

export function prettyPlatformName(value) {
  const normalized = normalizePlatformName(value);
  if (normalized === 'chatgpt') return 'ChatGPT';
  if (normalized === 'gemini') return 'Gemini';
  if (normalized === 'claude') return 'Claude';
  if (normalized === 'grok') return 'Grok';
  return value || 'Unknown';
}

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['user', 'human', 'prompt', 'customer'].includes(normalized)) return 'user';
  if (['assistant', 'model', 'ai', 'bot'].includes(normalized)) return 'assistant';
  if (['system', 'developer'].includes(normalized)) return 'system';
  if (['tool', 'function', 'plugin'].includes(normalized)) return 'tool';
  return normalized || 'assistant';
}

function stripExtension(value) {
  return String(value || '').replace(/\.(json|html?|mhtml|mht)$/i, '');
}

function titleFromSourceRef(sourceRef) {
  return stripExtension(String(sourceRef || ''))
    .replace(/^chatgpt_[a-f0-9]+_/i, '')
    .replace(/^grok_[a-f0-9]+_/i, '')
    .replace(/^gemini_/i, '')
    .replace(/^claude_/i, '')
    .replace(/[_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value, sourceRef, fallback = 'Untitled conversation') {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw || GENERIC_TITLES.has(raw.toLowerCase())) {
    return titleFromSourceRef(sourceRef) || fallback;
  }
  return raw;
}

function toIsoTimestamp(value, fallback) {
  if (!value && fallback) return fallback;
  if (!value) return undefined;
  if (typeof value === 'number') {
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  const stringValue = String(value).trim();
  if (!stringValue) return fallback;
  if (/^\d+(\.\d+)?$/.test(stringValue)) {
    return toIsoTimestamp(Number(stringValue), fallback);
  }
  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function textFromBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'text' || block.type === 'code') return block.text || '';
    if (block.type === 'image') return block.alt || block.url || '';
    if (block.type === 'file') return block.filename || block.url || '';
    return '';
  }).join('\n').trim();
}

function detectBlocksFromText(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) return [{ type: 'text', text: '' }];

  const blocks = [];
  const codePattern = /```([\w-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = codePattern.exec(normalized))) {
    if (match.index > lastIndex) {
      const preceding = normalized.slice(lastIndex, match.index).trim();
      if (preceding) blocks.push({ type: 'text', text: preceding });
    }
    blocks.push({ type: 'code', language: match[1] || undefined, text: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < normalized.length) {
    const trailing = normalized.slice(lastIndex).trim();
    if (trailing) blocks.push({ type: 'text', text: trailing });
  }

  const imageMatches = [...normalized.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((result) => ({ type: 'image', alt: result[1] || '', url: result[2] }));
  const fileMatches = [...normalized.matchAll(/\[([^\]]+\.(pdf|docx?|csv|xlsx?|zip|png|jpe?g|gif|webp|txt))\]\(([^)]+)\)/gi)].map((result) => ({ type: 'file', filename: result[1], url: result[3] }));

  if (blocks.length === 0) blocks.push({ type: 'text', text: normalized.trim() });
  return [...blocks, ...imageMatches, ...fileMatches];
}

function parseContentBlocks(contentBlocksJson) {
  if (!contentBlocksJson) return [{ type: 'text', text: '' }];
  try {
    const parsed = JSON.parse(contentBlocksJson);
    if (!Array.isArray(parsed)) return detectBlocksFromText(String(parsed || ''));
    const normalized = parsed.flatMap((block) => {
      if (typeof block === 'string') return detectBlocksFromText(block);
      if (!block || typeof block !== 'object') return [];
      if (block.type === 'code') return [{ type: 'code', language: block.language, text: String(block.text || '') }];
      if (block.type === 'image') return [{ type: 'image', alt: block.alt || '', url: block.url || '' }];
      if (block.type === 'file') return [{ type: 'file', filename: block.filename || '', url: block.url || '' }];
      return detectBlocksFromText(String(block.text || ''));
    });
    return normalized.length > 0 ? normalized : [{ type: 'text', text: '' }];
  } catch {
    return detectBlocksFromText(String(contentBlocksJson));
  }
}

function countWords(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SEARCH_STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function computeConversationStats(conversationId, snapshot) {
  const messages = Object.values(snapshot.messages).filter((message) => message.conversationId === conversationId);
  const textCorpus = [];
  const topicCounts = new Map();
  let hasCode = false;
  let hasImages = false;
  let hasFiles = false;

  for (const message of messages) {
    const blocks = parseContentBlocks(message.contentBlocksJson);
    const text = textFromBlocks(blocks);
    if (text) textCorpus.push(text);
    if (blocks.some((block) => block.type === 'code')) hasCode = true;
    if (blocks.some((block) => block.type === 'image')) hasImages = true;
    if (blocks.some((block) => block.type === 'file')) hasFiles = true;
    for (const token of tokenize(text)) topicCounts.set(token, (topicCounts.get(token) || 0) + 1);
  }

  const topTerms = [...topicCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([term]) => term);
  const preview = textCorpus.join(' ').slice(0, 220);

  return {
    messageCount: messages.length,
    branchCount: Object.values(snapshot.branches).filter((branch) => branch.conversationId === conversationId).length,
    hasCode,
    hasImages,
    hasFiles,
    topTerms,
    preview
  };
}

function stripSelectedSourcesForStorage(sources) {
  return (Array.isArray(sources) ? sources : []).map((source) => ({
    sourceName: source.sourceName,
    sourceKind: source.sourceKind
  }));
}

function isLikelyNormalizedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (!snapshot.accounts || !snapshot.conversations || !snapshot.branches || !snapshot.messages || !snapshot.importJobs) return false;
  const sampleMessage = Object.values(snapshot.messages || {})[0];
  if (!sampleMessage) return true;
  return typeof sampleMessage.contentBlocksJson === 'string';
}

function normalizeSnapshot(snapshotInput) {
  const snapshot = snapshotInput && typeof snapshotInput === 'object' ? snapshotInput : createEmptyArchive();
  if (snapshot.__meta?.normalizedVersion === ARCHIVE_SCHEMA_VERSION) return snapshot;
  snapshot.accounts = snapshot.accounts || {};
  snapshot.conversations = snapshot.conversations || {};
  snapshot.branches = snapshot.branches || {};
  snapshot.messages = snapshot.messages || {};
  snapshot.importJobs = snapshot.importJobs || {};
  snapshot.__meta = { ...(snapshot.__meta || {}), normalizedVersion: ARCHIVE_SCHEMA_VERSION };

  for (const account of Object.values(snapshot.accounts)) {
    account.platform = normalizePlatformName(account.platform);
    account.displayLabel = account.displayLabel || `${prettyPlatformName(account.platform)} import`;
    account.createdAt = toIsoTimestamp(account.createdAt, new Date().toISOString()) || new Date().toISOString();
    account.updatedAt = toIsoTimestamp(account.updatedAt, account.createdAt) || account.createdAt;
  }

  for (const message of Object.values(snapshot.messages)) {
    const blocks = parseContentBlocks(message.contentBlocksJson);
    const text = textFromBlocks(blocks);
    message.role = normalizeRole(message.role);
    message.contentBlocksJson = JSON.stringify(blocks);
    message.createdAt = toIsoTimestamp(message.createdAt);
    message.editedAt = toIsoTimestamp(message.editedAt, message.createdAt);
    message.wordCount = countWords(text);
    message.charCount = text.length;
    message.hasCode = blocks.some((block) => block.type === 'code');
    message.hasImages = blocks.some((block) => block.type === 'image');
    message.hasFiles = blocks.some((block) => block.type === 'file');
  }

  for (const conversation of Object.values(snapshot.conversations)) {
    conversation.platform = normalizePlatformName(conversation.platform);
    conversation.title = cleanTitle(conversation.title, conversation.sourceRef || conversation.rawJsonPath || conversation.rawHtmlPath);
    const conversationMessages = Object.values(snapshot.messages).filter((message) => message.conversationId === conversation.id);
    const messageTimes = conversationMessages.map((message) => message.createdAt).filter(Boolean).sort();
    conversation.createdAt = toIsoTimestamp(conversation.createdAt, messageTimes[0] || conversation.importedAt) || messageTimes[0] || conversation.importedAt;
    conversation.updatedAt = toIsoTimestamp(conversation.updatedAt, messageTimes.at(-1) || conversation.createdAt) || messageTimes.at(-1) || conversation.createdAt;
    conversation.importedAt = toIsoTimestamp(conversation.importedAt, new Date().toISOString()) || new Date().toISOString();
    const stats = computeConversationStats(conversation.id, snapshot);
    conversation.statsJson = JSON.stringify({
      ...(conversation.statsJson ? safeJson(conversation.statsJson) : {}),
      ...stats,
      normalizedTitle: conversation.title,
      normalizedPlatform: conversation.platform,
      lastMessageAt: conversation.updatedAt
    });
  }

  return snapshot;
}

function safeJson(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value || {};
  } catch {
    return {};
  }
}


function extractThinkingAndContent(text) {
  if (!text) return { thinking: '', content: '' };
  let thinking = '';
  let content = String(text || '');
  const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch) {
    thinking = thinkingMatch[1].trim();
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').trim();
  }
  const contentMatch = content.match(/<content>([\s\S]*?)<\/content>/i);
  if (contentMatch) content = contentMatch[1].trim();
  return {
    thinking,
    content: content.replace(/<\/?thinking>/gi, '').replace(/<\/?content>/gi, '').trim()
  };
}

function extractChatgptText(message) {
  const content = message?.content || {};
  if (Array.isArray(content.parts)) {
    return content.parts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\\n')
      .trim();
  }
  if (typeof content.text === 'string') return content.text.trim();
  if (typeof content.content === 'string') return content.content.trim();
  return '';
}

function extractChatgptReasoningRecap(content) {
  if (!content) return '';
  if (Array.isArray(content.parts)) return content.parts.join('').trim();
  if (typeof content.content === 'string') return content.content.trim();
  if (typeof content.text === 'string') return content.text.trim();
  return '';
}

function extractChatgptThoughts(content) {
  if (!Array.isArray(content?.thoughts)) return '';
  return content.thoughts
    .map((thought) => {
      const parts = [];
      if (thought?.summary) parts.push(String(thought.summary).trim());
      if (thought?.content) parts.push(String(thought.content).trim());
      return parts.filter(Boolean).join('\\n');
    })
    .filter(Boolean)
    .join('\\n\\n')
    .trim();
}

function getChatgptActiveNodeId(parsed) {
  const mapping = parsed?.mapping || {};
  if (parsed?.current_node && mapping[parsed.current_node]) return parsed.current_node;
  const leaves = Object.values(mapping).filter((node) => node && (!Array.isArray(node.children) || node.children.length === 0));
  if (leaves.length > 0) return leaves[0].id;
  return Object.keys(mapping)[0];
}

function parseLegacyChatgptMessages(parsed, importedAt) {
  const mapping = parsed?.mapping || {};
  const orderedNodeIds = [];
  const visited = new Set();
  let currentId = getChatgptActiveNodeId(parsed);
  while (currentId && mapping[currentId] && !visited.has(currentId)) {
    visited.add(currentId);
    orderedNodeIds.push(currentId);
    currentId = mapping[currentId]?.parent && mapping[mapping[currentId].parent] ? mapping[currentId].parent : null;
  }
  orderedNodeIds.reverse();
  const messages = [];
  let pendingThinking = '';
  let pendingRecap = '';
  for (const nodeId of orderedNodeIds) {
    const node = mapping[nodeId];
    const message = node?.message;
    if (!message) continue;
    const role = normalizeRole(message?.author?.role);
    const content = message?.content || {};
    const contentType = content?.content_type || '';
    const metadata = message?.metadata || {};

    if (role === 'tool') continue;

    if (role === 'assistant') {
      if (contentType === 'model_editable_context') {
        pendingThinking = '';
        pendingRecap = '';
        continue;
      }
      if (contentType === 'thoughts') {
        const thoughtText = extractChatgptThoughts(content);
        if (thoughtText) pendingThinking = pendingThinking ? `${pendingThinking}

${thoughtText}` : thoughtText;
        continue;
      }
      if (contentType === 'reasoning_recap') {
        pendingRecap = normalizeWhitespace(extractChatgptReasoningRecap(content));
        continue;
      }
      if (CHATGPT_TOOL_CONTENT_TYPES.has(contentType)) {
        continue;
      }
    }

    const rawText = applyChatgptContentReferences(extractChatgptText(message), metadata);
    const split = extractThinkingAndContent(rawText);
    const contentText = normalizeWhitespace(stripAssistantCitationTokens(split.content));
    const thinking = role === 'assistant'
      ? normalizeWhitespace([pendingRecap, pendingThinking, split.thinking].filter(Boolean).join('\n\n'))
      : normalizeWhitespace(split.thinking);

    if (!contentText && !thinking && role !== 'system') {
      if (role === 'assistant') {
        pendingThinking = '';
        pendingRecap = '';
      }
      continue;
    }

    messages.push({
      id: `${parsed?.conversation_id || 'chat'}:${message.id || nodeId}`,
      role,
      text: contentText,
      thinking,
      createdAt: toIsoTimestamp(message?.create_time, importedAt) || importedAt,
      model: message?.metadata?.model_slug,
      parentMessageId: node.parent && node.parent !== 'root' ? `${parsed?.conversation_id || 'chat'}:${node.parent}` : undefined
    });

    if (role === 'assistant') {
      pendingThinking = '';
      pendingRecap = '';
    }
  }
  return messages.filter((message) => message.text || message.thinking);
}


function buildLegacySnapshot() {
  const fullChats = readJson(LEGACY_FULL_KEY, []);
  if (!Array.isArray(fullChats) || fullChats.length === 0) return null;

  const snapshot = createEmptyArchive();
  const seenFingerprints = new Set();
  for (const entry of fullChats) {
    const fingerprint = entry.identityKey || buildConversationIdentity(entry) || entry.importKey || buildConversationFingerprint(entry);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);
    const platform = normalizePlatformName(entry.platform);
    const conversationId = entry.id || crypto.randomUUID();
    const accountId = `account:${platform}:legacy`;
    const importedAt = toIsoTimestamp(entry.date, new Date().toISOString()) || new Date().toISOString();
    snapshot.accounts[accountId] = snapshot.accounts[accountId] || {
      id: accountId,
      platform,
      displayLabel: `${prettyPlatformName(platform)} legacy import`,
      createdAt: importedAt,
      updatedAt: importedAt
    };
    snapshot.conversations[conversationId] = {
      id: conversationId,
      platform,
      accountId,
      title: cleanTitle(entry.title, entry.title),
      sourceType: 'manual_import',
      sourceRef: entry.title,
      favorite: false,
      importedAt,
      createdAt: importedAt,
      updatedAt: importedAt,
      statsJson: JSON.stringify({ messageCount: 0, branchCount: 1 })
    };
    const branchId = `branch:${conversationId}:main`;
    snapshot.branches[branchId] = {
      id: branchId,
      conversationId,
      branchDepth: 0,
      isLatest: true,
      branchLabel: 'Main',
      createdAt: importedAt,
      updatedAt: importedAt
    };
    const raw = entry.rawJson || {};
    const messages = Array.isArray(raw.messages)
      ? raw.messages.map((message, index) => ({
          id: `${conversationId}:${message.id || index}`,
          role: normalizeRole(message.role),
          text: String(message.text || ''),
          thinking: String(message.thinking || ''),
          createdAt: toIsoTimestamp(message.timestamp || message.createdAt, importedAt) || importedAt,
          model: message.model
        }))
      : raw.mapping
        ? parseLegacyChatgptMessages(raw, importedAt).map((message) => ({
            ...message,
            id: message.id.startsWith(`${conversationId}:`) ? message.id : `${conversationId}:${String(message.id).split(':').pop()}` ,
            parentMessageId: message.parentMessageId ? (message.parentMessageId.startsWith(`${conversationId}:`) ? message.parentMessageId : `${conversationId}:${String(message.parentMessageId).split(':').pop()}`) : undefined
          }))
        : [];

    messages.forEach((message, index) => {
      const messageText = String(message.text || '');
      snapshot.messages[message.id] = {
        id: message.id,
        conversationId,
        branchId,
        parentMessageId: message.parentMessageId || (index > 0 ? messages[index - 1].id : undefined),
        role: message.role,
        model: message.model,
        contentBlocksJson: JSON.stringify(detectBlocksFromText(messageText)),
        createdAt: message.createdAt,
        wordCount: countWords(messageText),
        charCount: messageText.length,
        hasCode: /```/.test(messageText),
        hasImages: /!\[[^\]]*\]\(/.test(messageText),
        hasFiles: /\[[^\]]+\.(pdf|docx?|csv|xlsx?|zip|png|jpe?g|gif|webp|txt)\]\(/i.test(messageText),
        sourceMetadataJson: JSON.stringify({ legacy: true, thinking: message.thinking || '' })
      };
    });
  }

  return normalizeSnapshot(snapshot);
}

function persistBrowserArchive(snapshotInput, options = {}) {
  const snapshot = options.skipNormalize ? snapshotInput : normalizeSnapshot(snapshotInput);
  snapshot.__meta = { ...(snapshot.__meta || {}), normalizedVersion: ARCHIVE_SCHEMA_VERSION };
  archiveMemoryCache = snapshot;
  if (options.deferPersist && typeof window !== 'undefined' && typeof window.setTimeout === 'function') scheduleArchivePersist(snapshot);
  else writeJson(ARCHIVE_KEY, snapshot);
  dispatchArchiveUpdated(snapshot);
  return snapshot;
}

export function readBrowserArchive() {
  if (archiveMemoryCache) return archiveMemoryCache;
  const existing = readJson(ARCHIVE_KEY, null);
  if (existing) {
    if (existing.__meta?.normalizedVersion === ARCHIVE_SCHEMA_VERSION) { archiveMemoryCache = existing; return existing; }
    if (isLikelyNormalizedSnapshot(existing)) {
      existing.__meta = { ...(existing.__meta || {}), normalizedVersion: ARCHIVE_SCHEMA_VERSION };
      archiveMemoryCache = existing;
      writeJson(ARCHIVE_KEY, existing);
      return existing;
    }
    const normalized = normalizeSnapshot(existing);
    persistBrowserArchive(normalized, { skipNormalize: true });
    return normalized;
  }
  const migrated = buildLegacySnapshot();
  if (migrated) {
    persistBrowserArchive(migrated);
    return migrated;
  }
  const empty = createEmptyArchive();
  archiveMemoryCache = empty;
  return empty;
}

export function createBrowserArchiveRepository() {
  const archive = readBrowserArchive();
  let dirty = false;
  const markDirty = () => { dirty = true; };

  return {
    upsertAccount(account) { const inserted = !archive.accounts[account.id]; archive.accounts[account.id] = account; markDirty(); return { inserted, id: account.id }; },
    upsertConversation(conversation) { const inserted = !archive.conversations[conversation.id]; archive.conversations[conversation.id] = conversation; markDirty(); return { inserted, id: conversation.id }; },
    upsertBranch(branch) { const inserted = !archive.branches[branch.id]; archive.branches[branch.id] = branch; markDirty(); return { inserted, id: branch.id }; },
    upsertMessage(message) { const inserted = !archive.messages[message.id]; archive.messages[message.id] = message; markDirty(); return { inserted, id: message.id }; },
    insertImportJob(job) { archive.importJobs[job.id] = job; markDirty(); },
    updateImportJob(jobId, patch) { archive.importJobs[jobId] = { ...archive.importJobs[jobId], ...patch }; markDirty(); },
    listLibraryConversations() {
      return listConversationSummaries(archive);
    },
    flush() {
      if (!dirty) return archive;
      dirty = false;
      archive.__meta = { ...(archive.__meta || {}), normalizedVersion: ARCHIVE_SCHEMA_VERSION };
      return persistBrowserArchive(archive, { skipNormalize: true, deferPersist: true });
    },
    getSnapshot() {
      return archive;
    }
  };
}

export function getSelectedSources() {
  if (selectedSourcesMemory.length > 0) return selectedSourcesMemory;
  const selected = readJson(SOURCES_KEY, null);
  if (selected) return selected;
  return readJson(LEGACY_SOURCES_KEY, []).map((source) => ({ ...source, sourceKind: source.sourceKind || 'json' }));
}

export function setSelectedSources(sources) {
  selectedSourcesMemory = Array.isArray(sources) ? sources : [];
  writeJson(SOURCES_KEY, stripSelectedSourcesForStorage(selectedSourcesMemory));
}

export function getWizardSnapshot() {
  return createWizardSnapshot(getSelectedSources());
}

export function executeSelectedImport(sources) {
  const repository = createBrowserArchiveRepository();
  const files = Array.isArray(sources) ? sources : getSelectedSources();
  const result = runImportWizard(repository, files);
  repository.flush?.();
  if (Array.isArray(sources)) selectedSourcesMemory = [];
  return result;
}

function getConversationMessagesInternal(snapshot, conversationId) {
  return Object.values(snapshot.messages)
    .filter((message) => message.conversationId === conversationId)
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .map((message) => {
      const blocks = parseContentBlocks(message.contentBlocksJson);
      const sourceMetadata = safeJson(message.sourceMetadataJson);
      const thinking = sourceMetadata.thinking || sourceMetadata.reasoning || sourceMetadata.metadata?.thinking || sourceMetadata.metadata?.reasoning || '';
      return {
        ...message,
        blocks,
        sourceMetadata,
        thinking,
        text: textFromBlocks(blocks)
      };
    });
}

export function listConversationSummaries(snapshotOverride) {
  const archive = snapshotOverride ? normalizeSnapshot(snapshotOverride) : readBrowserArchive();
  return Object.values(archive.conversations)
    .map((conversation) => {
      const stats = safeJson(conversation.statsJson);
      const account = archive.accounts[conversation.accountId];
      return {
        id: conversation.id,
        title: cleanTitle(conversation.title, conversation.sourceRef),
        platform: normalizePlatformName(conversation.platform),
        platformLabel: prettyPlatformName(conversation.platform),
        accountLabel: account?.displayLabel || 'Unknown account',
        updatedAt: conversation.updatedAt || conversation.importedAt,
        createdAt: conversation.createdAt,
        importedAt: conversation.importedAt,
        messageCount: stats.messageCount || getConversationMessagesInternal(archive, conversation.id).length,
        branchCount: stats.branchCount || Object.values(archive.branches).filter((branch) => branch.conversationId === conversation.id).length,
        hasCode: !!stats.hasCode,
        hasImages: !!stats.hasImages,
        hasFiles: !!stats.hasFiles,
        preview: stats.preview || getConversationMessagesInternal(archive, conversation.id).find((message) => message.text)?.text?.slice(0, 220) || '',
        topTerms: Array.isArray(stats.topTerms) ? stats.topTerms : [],
        favorite: !!conversation.favorite
      };
    })
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

export function getLibraryItems(options = {}) {
  const { query = '', platform = 'all', favoriteOnly = false, withAttachmentsOnly = false } = options;
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const summaries = listConversationSummaries();
  return summaries.filter((item) => {
    if (platform !== 'all' && normalizePlatformName(item.platform) !== normalizePlatformName(platform)) return false;
    if (favoriteOnly && !item.favorite) return false;
    if (withAttachmentsOnly && !(item.hasFiles || item.hasImages)) return false;
    if (!normalizedQuery) return true;
    const haystack = [item.title, item.preview, ...(item.topTerms || [])].join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getAvailablePlatforms() {
  return Array.from(new Set(listConversationSummaries().map((item) => item.platform))).sort();
}

export function getConversationDetail(chatId) {
  const archive = readBrowserArchive();
  const conversation = archive.conversations[chatId];
  if (!conversation) return null;
  return {
    conversation,
    account: archive.accounts[conversation.accountId],
    messages: getConversationMessagesInternal(archive, chatId)
  };
}

export function exportConversationJson(chatId) {
  const detail = getConversationDetail(chatId);
  if (!detail) return null;
  return exportConversationAsRewind(detail);
}

export function toggleConversationFavorite(chatId) {
  const archive = readBrowserArchive();
  const conversation = archive.conversations[chatId];
  if (!conversation) return false;
  conversation.favorite = !conversation.favorite;
  persistBrowserArchive(archive);
  return conversation.favorite;
}

export function removeConversations(ids) {
  const idSet = new Set(ids);
  const archive = readBrowserArchive();
  const conversationCount = Object.keys(archive.conversations).length;
  const removingAll = conversationCount > 0 && idSet.size >= conversationCount;
  const removedKeys = new Set();

  const addRemovedEntryKeys = (entry) => {
    if (!entry) return;
    const rawMessages = Array.isArray(entry.rawJson?.messages)
      ? entry.rawJson.messages
      : Array.isArray(entry.messages)
        ? entry.messages
        : [];
    const normalizedMessages = rawMessages.map((message) => ({
      text: String(message?.text || message?.content || '').trim(),
      thinking: String(message?.thinking || '').trim(),
    })).filter((message) => message.text || message.thinking);
    const rawConversationId = entry.rawJson?.conversationId || entry.rawJson?.conversation_id || entry.rawJson?.uuid || entry.rawJson?.id || entry.conversationId || '';
    const sourceRef = entry.sourceRef || entry.sourceFile || entry.title || '';
    const baseEntry = {
      platform: entry.platform,
      title: entry.title,
      sourceFile: sourceRef,
      conversationId: rawConversationId,
      rawJson: {
        conversationId: rawConversationId,
        messages: normalizedMessages,
      },
      msgCount: normalizedMessages.length || entry.msgCount || entry.messageCount || 0,
    };
    removedKeys.add(buildConversationIdentity(baseEntry));
    removedKeys.add(buildConversationFingerprint(baseEntry));
    if (entry.identityKey) removedKeys.add(String(entry.identityKey));
    if (entry.importKey) removedKeys.add(String(entry.importKey));
    if (sourceRef) removedKeys.add(`${normalizePlatformName(entry.platform)}::${stripExtension(sourceRef).toLowerCase()}`);
    if (entry.title) removedKeys.add(`${normalizePlatformName(entry.platform)}::${cleanTitle(entry.title, sourceRef || entry.title).toLowerCase()}`);
  };

  Object.keys(archive.conversations).forEach((id) => {
    if (idSet.has(id)) {
      const detail = getConversationDetail(id);
      addRemovedEntryKeys({
        platform: archive.conversations[id].platform,
        title: archive.conversations[id].title,
        sourceRef: archive.conversations[id].sourceRef,
        messages: detail?.messages || [],
      });
      delete archive.conversations[id];
    }
  });
  Object.keys(archive.branches).forEach((id) => {
    if (idSet.has(archive.branches[id].conversationId)) delete archive.branches[id];
  });
  Object.keys(archive.messages).forEach((id) => {
    if (idSet.has(archive.messages[id].conversationId)) delete archive.messages[id];
  });

  if (removingAll) {
    writeJson(LEGACY_LIBRARY_KEY, []);
    writeJson(LEGACY_FULL_KEY, []);
  } else {
    const shouldKeep = (entry) => {
      const identity = buildConversationIdentity(entry);
      const fingerprint = buildConversationFingerprint(entry);
      const importKey = entry?.importKey ? String(entry.importKey) : '';
      const entryIdentityKey = entry?.identityKey ? String(entry.identityKey) : '';
      return !removedKeys.has(identity) && !removedKeys.has(fingerprint) && !removedKeys.has(importKey) && !removedKeys.has(entryIdentityKey);
    };
    const legacySummaries = readJson(LEGACY_LIBRARY_KEY, []);
    const legacyFull = readJson(LEGACY_FULL_KEY, []);
    writeJson(LEGACY_LIBRARY_KEY, legacySummaries.filter(shouldKeep));
    writeJson(LEGACY_FULL_KEY, legacyFull.filter(shouldKeep));
  }

  persistBrowserArchive(archive);
}

export function getRewindAnalytics(selectedYear = 'all') {
  const archive = readBrowserArchive();
  return computeRewindAnalytics(archive, selectedYear);
}

export function searchArchive(query, limit = 50) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];
  const archive = readBrowserArchive();
  const results = [];
  for (const summary of listConversationSummaries()) {
    const detail = getConversationDetail(summary.id);
    const joined = [summary.title, summary.preview, ...(detail?.messages || []).map((message) => message.text)].join('\n');
    const index = joined.toLowerCase().indexOf(normalizedQuery);
    if (index >= 0) {
      const start = Math.max(0, index - 80);
      const end = Math.min(joined.length, index + normalizedQuery.length + 120);
      results.push({
        conversationId: summary.id,
        title: summary.title,
        platform: summary.platform,
        platformLabel: summary.platformLabel,
        snippet: joined.slice(start, end).replace(/\s+/g, ' ').trim(),
        updatedAt: summary.updatedAt
      });
    }
  }
  return results.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))).slice(0, limit);
}

export async function checkLocalApiHealth(baseUrl = DEFAULT_API_BASE) {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) return { ok: false };
    const data = await response.json();
    return { ok: data?.status === 'ok', data };
  } catch {
    return { ok: false };
  }
}

export async function syncArchiveToLocalApi(baseUrl = DEFAULT_API_BASE) {
  const snapshot = readBrowserArchive();
  const response = await fetch(`${baseUrl}/archive/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot })
  });
  if (!response.ok) throw new Error(`Failed to sync archive (${response.status})`);
  return response.json();
}


export function invalidateBrowserArchive(options = {}) {
  if (typeof window !== 'undefined' && window.localStorage && options.clearPersisted) {
    window.localStorage.removeItem(ARCHIVE_KEY);
    if (options.clearLegacy) {
      window.localStorage.removeItem(LEGACY_LIBRARY_KEY);
      window.localStorage.removeItem(LEGACY_FULL_KEY);
    }
  }
  archiveMemoryCache = null;
  if (archivePersistTimer) { window.clearTimeout(archivePersistTimer); archivePersistTimer = null; }
  if (options.notify) dispatchArchiveUpdated(createEmptyArchive());
}

export function refreshBrowserArchive(options = {}) {
  if (typeof window !== 'undefined' && window.localStorage && options.clearPersisted) {
    window.localStorage.removeItem(ARCHIVE_KEY);
    if (options.clearLegacy) {
      window.localStorage.removeItem(LEGACY_LIBRARY_KEY);
      window.localStorage.removeItem(LEGACY_FULL_KEY);
    }
  }
  archiveMemoryCache = null;
  if (archivePersistTimer) { window.clearTimeout(archivePersistTimer); archivePersistTimer = null; }
  const snapshot = readBrowserArchive();
  dispatchArchiveUpdated(snapshot);
  return snapshot;
}

export function resetBrowserArchive() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(SOURCES_KEY);
    window.localStorage.removeItem(LEGACY_SOURCES_KEY);
    window.localStorage.removeItem(ARCHIVE_KEY);
    window.localStorage.removeItem(LEGACY_LIBRARY_KEY);
    window.localStorage.removeItem(LEGACY_FULL_KEY);
    archiveMemoryCache = null;
    if (archivePersistTimer) { window.clearTimeout(archivePersistTimer); archivePersistTimer = null; }
    dispatchArchiveUpdated(createEmptyArchive());
  }
}

export function subscribeArchive(listener) {
  if (typeof window === 'undefined') return () => {};
  const handle = () => listener(readBrowserArchive());
  window.addEventListener('storage', handle);
  window.addEventListener(ARCHIVE_EVENT, handle);
  return () => {
    window.removeEventListener('storage', handle);
    window.removeEventListener(ARCHIVE_EVENT, handle);
  };
}
