import type { Platform } from '@rewind/shared';
export * from './lyra';

export type ParserWarningCode =
  | 'title_missing'
  | 'timestamp_partial'
  | 'role_guess_used'
  | 'unsupported_block_type'
  | 'attachment_reference_partial'
  | 'branch_inference_unavailable'
  | 'malformed_html'
  | 'unknown_section_skipped';

export interface HtmlMessageCandidate {
  id: string;
  role: string;
  text: string;
  createdAt?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface HtmlParseResult {
  kind: 'html';
  platform: Extract<Platform, 'chatgpt' | 'gemini' | 'claude' | 'grok'>;
  title: string;
  accountLabel: string;
  conversationId: string;
  updatedAt?: string;
  createdAt?: string;
  confidence: number;
  warnings: ParserWarningCode[];
  messages: HtmlMessageCandidate[];
  rawHtmlPath: string;
  metadata: Record<string, unknown>;
}

export interface HtmlDetectionResult {
  platformGuess?: Extract<Platform, 'chatgpt' | 'gemini' | 'claude' | 'grok'>;
  confidence: number;
  warnings: ParserWarningCode[];
}

function decodeQuotedPrintable(str: string): string {
  let result = str.replace(/=\r?\n/g, '');
  result = result.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  try {
    const bytes = new Uint8Array(result.split('').map((char) => char.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return result;
  }
}

function normalizeHtmlSource(raw: string): string {
  if (!raw) return '';
  let normalized = raw;

  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(normalized) || normalized.includes('=3D') || /Snapshot-Content-Location:/i.test(normalized)) {
    normalized = decodeQuotedPrintable(normalized);
  }

  const htmlStart = normalized.search(/<!doctype html|<html/i);
  if (htmlStart >= 0) normalized = normalized.slice(htmlStart);

  const htmlEndMatch = normalized.match(/<\/html>/i);
  if (htmlEndMatch && typeof htmlEndMatch.index === 'number') {
    normalized = normalized.slice(0, htmlEndMatch.index + htmlEndMatch[0].length);
  }

  return normalized;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeSourceName(sourceName: string) {
  return sourceName
    .replace(/\.(mhtml|mht|html?)$/i, '')
    .replace(/[#_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAttribute(fragment: string, name: string) {
  const pattern = new RegExp(`${name}=["']([^"']+)["']`, 'i');
  return fragment.match(pattern)?.[1];
}

function readMeta(html: string, name: string) {
  const pattern = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  return html.match(pattern)?.[1];
}

function readTitle(html: string) {
  return decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function readSnapshotUrl(raw: string) {
  return raw.match(/Snapshot-Content-Location:\s*(.+)/i)?.[1]?.trim();
}

function collectWarnings(html: string, messages: HtmlMessageCandidate[], fallbackTitle: string) {
  const warnings = new Set<ParserWarningCode>();
  if (!fallbackTitle) warnings.add('title_missing');
  if (messages.some((message) => !message.createdAt)) warnings.add('timestamp_partial');
  if (messages.some((message) => message.metadata?.roleGuessed)) warnings.add('role_guess_used');
  if (/data-unsupported-block/i.test(html)) warnings.add('unsupported_block_type');
  if (/data-attachment-partial/i.test(html)) warnings.add('attachment_reference_partial');
  warnings.add('branch_inference_unavailable');
  if (/data-unknown-section/i.test(html)) warnings.add('unknown_section_skipped');
  if (!/<html/i.test(html) || !/<body/i.test(html)) warnings.add('malformed_html');
  return [...warnings];
}

function genericTitle(sourceName: string, fallback?: string) {
  const generic = new Set(['google gemini', 'grok', 'chatgpt', 'google gemini app', 'claude']);
  if (fallback && !generic.has(fallback.trim().toLowerCase())) return fallback;
  return sanitizeSourceName(sourceName) || fallback || sourceName;
}

function collectTagBlocks(html: string, tagName: string) {
  const regex = new RegExp(`<${tagName}(?=[\\s>])[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return [...html.matchAll(regex)].map((match) => ({ index: match.index || 0, block: match[0] }));
}


function collectChatgptTurns(html: string) {
  const wrappers = [...html.matchAll(/<(?:section|div|article)[^>]*data-testid=["']conversation-turn[^"']*["'][^>]*>/gi)].map((match) => ({
    index: match.index || 0,
    openingTag: match[0]
  }))
  return wrappers.map((entry, index) => ({
    ...entry,
    block: html.slice(entry.index, wrappers[index + 1]?.index ?? html.length)
  }))
}

function readChatgptMessageMeta(fragment: string) {
  const direct = fragment.match(/data-message-author-role=["']([^"']+)["'][^>]*data-message-id=["']([^"']+)["']/i)
  if (direct) {
    return { role: direct[1], messageId: direct[2] }
  }
  const reverse = fragment.match(/data-message-id=["']([^"']+)["'][^>]*data-message-author-role=["']([^"']+)["']/i)
  if (reverse) {
    return { role: reverse[2], messageId: reverse[1] }
  }
  return null
}

function extractChatgptTurnText(block: string, role: string) {
  const preferred = role === 'user'
    ? block.match(/<div[^>]*class=["'][^"']*whitespace-pre-wrap[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
      || block
    : block.match(/<div[^>]*class=["'][^"']*\bmarkdown\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || block.match(/<div[^>]*class=["'][^"']*prose[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || block
  return decodeHtml(preferred)
    .replace(/\bCopy\b/gi, '')
    .replace(/\bRetry\b/gi, '')
    .replace(/\bEdit\b/gi, '')
    .trim()
}

export function detectHtmlPlatform(sourceName: string, rawHtml: string): HtmlDetectionResult {
  const html = normalizeHtmlSource(rawHtml);
  const normalized = html.toLowerCase();
  const warnings: ParserWarningCode[] = [];

  const chatgptSignals = [
    /application-name["'][^>]*content=["']chatgpt/i.test(html),
    /data-chatgpt-conversation-id=/i.test(html),
    /data-testid=["']conversation-turn/i.test(html),
    /data-message-author-role=/i.test(html),
    /chatgpt\.com/i.test(html)
  ].filter(Boolean).length;

  const geminiSignals = [
    /application-name["'][^>]*content=["']gemini/i.test(html),
    /google gemini/i.test(html),
    /gemini\.google\.com/i.test(html),
    /<user-query(?=[\s>])/i.test(html),
    /<message-content(?=[\s>])/i.test(html),
    /data-test-id=["']conversation-title["']/i.test(html)
  ].filter(Boolean).length;

  const claudeSignals = [
    /claude\.ai/i.test(html),
    /data-theme=["']claude/i.test(html),
    /data-testid=["']user-message["']/i.test(html),
    /data-is-streaming=["'](?:true|false)["']/i.test(html),
    /font-claude-response/i.test(html),
    /anthropic/i.test(html)
  ].filter(Boolean).length;

  const grokSignals = [
    /truth-seeking ai chatbot by xai/i.test(html),
    /grok\.com/i.test(html),
    /response-content-markdown/i.test(html),
    /<div[^>]+id=["']response-/i.test(html)
  ].filter(Boolean).length;

  if (!normalized.includes('<html')) warnings.push('malformed_html');

  if (chatgptSignals === 0 && geminiSignals === 0 && claudeSignals === 0 && grokSignals === 0) {
    return { confidence: 0.2, warnings: [...new Set([...warnings, 'unknown_section_skipped'])] as ParserWarningCode[] };
  }

  if (grokSignals > chatgptSignals && grokSignals >= geminiSignals && grokSignals >= claudeSignals) {
    return { platformGuess: 'grok', confidence: Math.min(0.99, 0.45 + grokSignals * 0.12), warnings };
  }

  if (claudeSignals > chatgptSignals && claudeSignals >= geminiSignals) {
    return { platformGuess: 'claude', confidence: Math.min(0.98, 0.45 + claudeSignals * 0.1), warnings };
  }

  if (geminiSignals > chatgptSignals) {
    return { platformGuess: 'gemini', confidence: Math.min(0.98, 0.45 + geminiSignals * 0.1), warnings };
  }

  return { platformGuess: 'chatgpt', confidence: Math.min(0.99, 0.45 + chatgptSignals * 0.13), warnings };
}


function parseChatgptHtml(sourceName: string, rawHtml: string): HtmlParseResult {
  const html = normalizeHtmlSource(rawHtml)
  const snapshotUrl = readSnapshotUrl(rawHtml) || readSnapshotUrl(html) || ''
  const conversationId = readMeta(html, 'rewind-conversation-id')
    || readAttribute(html.match(/data-chatgpt-conversation-id=["'][^"']+["']/i)?.[0] || '', 'data-chatgpt-conversation-id')
    || snapshotUrl.match(/\/c\/([^?/#"']+)/i)?.[1]
    || sourceName
  const title = genericTitle(sourceName, readMeta(html, 'rewind-title') || readTitle(html))
  const accountLabel = readMeta(html, 'rewind-account-label') || 'ChatGPT HTML import'
  const updatedAt = readMeta(html, 'rewind-updated-at') || undefined
  const createdAt = readMeta(html, 'rewind-created-at') || updatedAt

  const turns = collectChatgptTurns(html)
  const messages = turns.map((entry, index) => {
    const meta = readChatgptMessageMeta(entry.block)
    const role = meta?.role || readAttribute(entry.openingTag, 'data-turn') || (index % 2 === 0 ? 'user' : 'assistant')
    const text = extractChatgptTurnText(entry.block, role)
    return {
      id: meta?.messageId || readAttribute(entry.openingTag, 'data-turn-id') || `message-${index}`,
      role,
      text,
      createdAt: readAttribute(entry.block, 'datetime') || updatedAt,
      model: readAttribute(entry.block, 'data-message-model-slug') || readAttribute(entry.block, 'data-model') || undefined,
      metadata: { roleGuessed: !meta?.role, snapshotUrl }
    }
  }).filter((message) => message.text)

  const warnings = collectWarnings(html, messages, title)
  const detection = detectHtmlPlatform(sourceName, rawHtml)

  return {
    kind: 'html',
    platform: 'chatgpt',
    title,
    accountLabel,
    conversationId,
    updatedAt,
    createdAt,
    confidence: Math.max(0.35, Math.min(0.99, detection.confidence - warnings.length * 0.03 + (messages.length > 1 ? 0.06 : 0))),
    warnings,
    messages,
    rawHtmlPath: sourceName,
    metadata: { sourceName, signatureConfidence: detection.confidence, snapshotUrl }
  }
}

function parseGeminiHtml(sourceName: string, rawHtml: string): HtmlParseResult {
  const html = normalizeHtmlSource(rawHtml);
  const snapshotUrl = readSnapshotUrl(rawHtml) || readSnapshotUrl(html) || '';
  const conversationId = readMeta(html, 'rewind-conversation-id')
    || readAttribute(html.match(/data-gemini-conversation-id=["'][^"']+["']/i)?.[0] || '', 'data-gemini-conversation-id')
    || snapshotUrl.match(/\/app\/([^?/#"']+)/i)?.[1]
    || sourceName;
  const title = genericTitle(sourceName,
    readMeta(html, 'rewind-title')
    || decodeHtml(html.match(/data-test-id=["']conversation-title["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '')
    || readTitle(html)
  );
  const accountLabel = readMeta(html, 'rewind-account-label') || 'Gemini HTML import';
  const updatedAt = readMeta(html, 'rewind-updated-at') || undefined;
  const createdAt = readMeta(html, 'rewind-created-at') || updatedAt;

  const userBlocks = collectTagBlocks(html, 'user-query').map((entry) => ({ ...entry, role: 'user' as const }));
  const assistantBlocks = collectTagBlocks(html, 'message-content').map((entry) => ({ ...entry, role: 'assistant' as const }));
  const ordered = [...userBlocks, ...assistantBlocks].sort((left, right) => left.index - right.index);

  const messages = ordered.map((entry, index) => {
    const block = entry.block;
    const messageId = readAttribute(block, 'id') || `message-${index}`;
    const preferred = entry.role === 'user'
      ? block.match(/<div[^>]*id=["']user-query-content-[^"']+["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
        || block.match(/<div[^>]*class=["'][^"']*query-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
        || block
      : block.match(/<div[^>]*class=["'][^"']*markdown-main-panel[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
        || block.match(/<div[^>]*class=["'][^"']*model-response-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
        || block;
    const text = decodeHtml(preferred)
      .replace(/\bcopy prompt\b/gi, '')
      .replace(/複製提示詞/g, '')
      .trim();
    return {
      id: messageId,
      role: entry.role,
      text,
      createdAt: updatedAt,
      metadata: { roleGuessed: false }
    };
  }).filter((message) => message.text);

  const warnings = collectWarnings(html, messages, title);
  const detection = detectHtmlPlatform(sourceName, rawHtml);

  return {
    kind: 'html',
    platform: 'gemini',
    title,
    accountLabel,
    conversationId,
    updatedAt,
    createdAt,
    confidence: Math.max(0.35, Math.min(0.98, detection.confidence - warnings.length * 0.03 + (messages.length > 1 ? 0.06 : 0))),
    warnings,
    messages,
    rawHtmlPath: sourceName,
    metadata: { sourceName, signatureConfidence: detection.confidence, snapshotUrl }
  };
}


function parseClaudeHtml(sourceName: string, rawHtml: string): HtmlParseResult {
  const html = normalizeHtmlSource(rawHtml);
  const snapshotUrl = readSnapshotUrl(rawHtml) || readSnapshotUrl(html) || '';
  const conversationId = readMeta(html, 'rewind-conversation-id')
    || snapshotUrl.match(/\/chat\/([^?/#"']+)/i)?.[1]
    || sourceName;
  const title = genericTitle(sourceName, readMeta(html, 'rewind-title') || readTitle(html));
  const accountLabel = readMeta(html, 'rewind-account-label') || 'Claude HTML import';
  const updatedAt = readMeta(html, 'rewind-updated-at') || undefined;
  const createdAt = readMeta(html, 'rewind-created-at') || updatedAt;

  const openings = [...html.matchAll(/<div[^>]*(data-testid=["']user-message["']|data-is-streaming=["'](?:true|false)["'])[^>]*>/gi)].map((match) => ({
    index: match.index || 0,
    openingTag: match[0]
  }));

  const messages = openings.map((entry, index) => {
    const end = openings[index + 1]?.index ?? html.length;
    const slice = html.slice(entry.index, end);
    const isUser = /data-testid=["']user-message["']/i.test(entry.openingTag);
    const preferred = isUser
      ? slice.match(/<p[^>]*class=["'][^"']*whitespace-pre-wrap[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
        || slice
      : [...slice.matchAll(/<(p|li|h[1-6]|blockquote|pre)[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => decodeHtml(match[2])).join('\n')
        || slice.match(/<p[^>]*class=["'][^"']*font-claude-response-body[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
        || slice;
    const text = decodeHtml(preferred)
      .replace(/\bCopy\b/gi, '')
      .replace(/\bRetry\b/gi, '')
      .trim();
    return {
      id: readAttribute(entry.openingTag, 'id') || `message-${index}`,
      role: isUser ? 'user' : 'assistant',
      text,
      createdAt: updatedAt,
      metadata: { roleGuessed: false }
    };
  }).filter((message) => message.text);

  const warnings = collectWarnings(html, messages, title);
  const detection = detectHtmlPlatform(sourceName, rawHtml);

  return {
    kind: 'html',
    platform: 'claude',
    title,
    accountLabel,
    conversationId,
    updatedAt,
    createdAt,
    confidence: Math.max(0.35, Math.min(0.98, detection.confidence - warnings.length * 0.03 + (messages.length > 1 ? 0.06 : 0))),
    warnings,
    messages,
    rawHtmlPath: sourceName,
    metadata: { sourceName, signatureConfidence: detection.confidence, snapshotUrl }
  };
}

function parseGrokHtml(sourceName: string, rawHtml: string): HtmlParseResult {
  const html = normalizeHtmlSource(rawHtml);
  const snapshotUrl = readSnapshotUrl(rawHtml) || readSnapshotUrl(html) || '';
  const conversationId = readMeta(html, 'rewind-conversation-id')
    || snapshotUrl.match(/\/c\/([^?/#"']+)/i)?.[1]
    || readAttribute(html.match(/id=["']response-[^"']+["']/i)?.[0] || '', 'id')
    || sourceName;
  const title = genericTitle(sourceName, readMeta(html, 'rewind-title') || readTitle(html));
  const accountLabel = readMeta(html, 'rewind-account-label') || 'Grok HTML import';
  const updatedAt = readMeta(html, 'rewind-updated-at') || undefined;
  const createdAt = readMeta(html, 'rewind-created-at') || updatedAt;

  const openings = [...html.matchAll(/<div[^>]*id=["']response-([^"']+)["'][^>]*>/gi)].map((match) => ({
    id: match[1],
    index: match.index || 0,
    openingTag: match[0]
  }));

  const messages = openings.map((entry, index) => {
    const end = openings[index + 1]?.index ?? html.length;
    const slice = html.slice(entry.index, end);
    const role = /items-end/i.test(entry.openingTag) ? 'user' : 'assistant';
    const preferred = slice.match(/<div[^>]*class=["'][^"']*response-content-markdown[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<section/i)?.[1]
      || slice.match(/<div[^>]*class=["'][^"']*response-content-markdown[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || slice;
    const text = decodeHtml(preferred).trim();
    return {
      id: entry.id,
      role,
      text,
      createdAt: updatedAt,
      metadata: { roleGuessed: false }
    };
  }).filter((message) => message.text);

  const warnings = collectWarnings(html, messages, title);
  const detection = detectHtmlPlatform(sourceName, rawHtml);

  return {
    kind: 'html',
    platform: 'grok',
    title,
    accountLabel,
    conversationId,
    updatedAt,
    createdAt,
    confidence: Math.max(0.35, Math.min(0.99, detection.confidence - warnings.length * 0.03 + (messages.length > 1 ? 0.06 : 0))),
    warnings,
    messages,
    rawHtmlPath: sourceName,
    metadata: { sourceName, signatureConfidence: detection.confidence, snapshotUrl }
  };
}

export function parseHtmlImport(sourceName: string, html: string): HtmlParseResult {
  const detection = detectHtmlPlatform(sourceName, html);
  if (detection.platformGuess === 'chatgpt') return parseChatgptHtml(sourceName, html);
  if (detection.platformGuess === 'gemini') return parseGeminiHtml(sourceName, html);
  if (detection.platformGuess === 'claude') return parseClaudeHtml(sourceName, html);
  if (detection.platformGuess === 'grok') return parseGrokHtml(sourceName, html);
  throw new Error(`Unsupported HTML import source for ${sourceName}`);
}
