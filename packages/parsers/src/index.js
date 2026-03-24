function decodeQuotedPrintable(str) {
  let result = str.replace(/=\r?\n/g, '');
  result = result.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  try {
    const bytes = new Uint8Array(result.split('').map((char) => char.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return result;
  }
}

function normalizeHtmlSource(raw) {
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizePreservingLines(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function htmlToMarkdownish(value) {
  let text = cleanHtmlForText(String(value || ''));

  text = text
    .replace(/<pre[^>]*>\s*<code(?:[^>]*class=["'][^"']*language-([a-zA-Z0-9_+-]+)[^"']*["'])?[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, lang, code) => `\n\`\`\`${lang || ''}\n${decodeHtml(code)}\n\`\`\`\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code) => `\n\`\`\`\n${decodeHtml(code)}\n\`\`\`\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|blockquote|h[1-6]|ul|ol|table|tr)>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  return normalizePreservingLines(decodeHtml(text));
}

function sanitizeSourceName(sourceName) {
  return sourceName
    .replace(/\.(mhtml|mht|html?)$/i, '')
    .replace(/[#_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readAttribute(fragment, name) {
  const pattern = new RegExp(`${name}=["']([^"']+)["']`, 'i');
  return fragment.match(pattern)?.[1];
}

function readMeta(html, name) {
  const pattern = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  return html.match(pattern)?.[1];
}

function readTitle(html) {
  return decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function readSnapshotUrl(raw) {
  return raw.match(/Snapshot-Content-Location:\s*(.+)/i)?.[1]?.trim();
}

function collectWarnings(html, messages, fallbackTitle) {
  const warnings = new Set();
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

function genericTitle(sourceName, fallback) {
  const generic = new Set(['google gemini', 'grok', 'chatgpt', 'google gemini app', 'claude']);
  if (fallback && !generic.has(fallback.trim().toLowerCase())) return fallback;
  return sanitizeSourceName(sourceName) || fallback || sourceName;
}

function collectTagBlocks(html, tagName) {
  const regex = new RegExp(`<${tagName}(?=[\\s>])[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return [...html.matchAll(regex)].map((match) => ({ index: match.index || 0, block: match[0] }));
}


function extractBalancedBlock(html, startIndex, tagName) {
  const openPattern = new RegExp(`<${tagName}(?=[\\s>])`, 'gi');
  const closePattern = new RegExp(`</${tagName}>`, 'gi');
  openPattern.lastIndex = startIndex;
  const firstOpen = openPattern.exec(html);
  if (!firstOpen || firstOpen.index !== startIndex) return null;
  let depth = 1;
  let cursor = openPattern.lastIndex;
  while (depth > 0) {
    closePattern.lastIndex = cursor;
    const closeMatch = closePattern.exec(html);
    if (!closeMatch) return null;
    openPattern.lastIndex = cursor;
    const nextOpen = openPattern.exec(html);
    if (nextOpen && nextOpen.index < closeMatch.index) {
      depth += 1;
      cursor = openPattern.lastIndex;
      continue;
    }
    depth -= 1;
    cursor = closePattern.lastIndex;
  }
  return html.slice(startIndex, cursor);
}

function collectBalancedTagBlocks(html, tagName) {
  const openPattern = new RegExp(`<${tagName}(?=[\\s>])[^>]*>`, 'gi');
  const results = [];
  let match;
  while ((match = openPattern.exec(html))) {
    const block = extractBalancedBlock(html, match.index || 0, tagName);
    if (block) results.push({ index: match.index || 0, block });
  }
  return results;
}

function extractBalancedInnerBySelector(block, selectorRegex, tagName = 'div') {
  const match = selectorRegex.exec(block);
  if (!match || typeof match.index !== 'number') return '';
  return extractBalancedBlock(block, match.index, tagName) || '';
}

function cleanHtmlForText(html) {
  return String(html || '')
    .replace(/<button[\s\S]*?<\/button>/gi, ' ')
    .replace(/<mat-icon[\s\S]*?<\/mat-icon>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
}

function decodeHtmlToText(value) {
  return htmlToMarkdownish(value)
    .replace(/\bcopy prompt\b/gi, '')
    .replace(/複製提示詞/g, '')
    .replace(/\bCopy\b/g, '')
    .replace(/\bRetry\b/g, '')
    .replace(/\bEdit\b/g, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function stripGeminiLeadIn(text) {
  return String(text || '').replace(/^(?:你說了|You said)\s+/i, '').trim();
}

function collectChatgptTurns(html) {
  const wrappers = [...html.matchAll(/<(?:section|div|article)[^>]*data-testid=["']conversation-turn[^"']*["'][^>]*>/gi)].map((match) => ({
    index: match.index || 0,
    openingTag: match[0]
  }));
  return wrappers.map((entry, index) => ({
    ...entry,
    block: html.slice(entry.index, wrappers[index + 1]?.index ?? html.length)
  }));
}

function readChatgptMessageMeta(fragment) {
  const direct = fragment.match(/data-message-author-role=["']([^"']+)["'][^>]*data-message-id=["']([^"']+)["']/i);
  if (direct) {
    return { role: direct[1], messageId: direct[2] };
  }
  const reverse = fragment.match(/data-message-id=["']([^"']+)["'][^>]*data-message-author-role=["']([^"']+)["']/i);
  if (reverse) {
    return { role: reverse[2], messageId: reverse[1] };
  }
  return null;
}

function extractChatgptTurnText(block, role) {
  const preferred = role === 'user'
    ? block.match(/<div[^>]*class=["'][^"']*whitespace-pre-wrap[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
      || block
    : block.match(/<div[^>]*class=["'][^"']*markdown[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || block.match(/<div[^>]*class=["'][^"']*prose[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || block;
  return htmlToMarkdownish(preferred)
    .replace(/\bCopy\b/gi, '')
    .replace(/\bRetry\b/gi, '')
    .replace(/\bEdit\b/gi, '')
    .trim();
}

export function detectHtmlPlatform(sourceName, rawHtml) {
  const html = normalizeHtmlSource(rawHtml);
  const normalized = html.toLowerCase();
  const warnings = [];

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
    return { confidence: 0.2, warnings: [...new Set([...warnings, 'unknown_section_skipped'])] };
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


function parseChatgptHtml(sourceName, rawHtml) {
  const html = normalizeHtmlSource(rawHtml);
  const snapshotUrl = readSnapshotUrl(rawHtml) || readSnapshotUrl(html) || '';
  const conversationId = readMeta(html, 'rewind-conversation-id')
    || readAttribute(html.match(/data-chatgpt-conversation-id=["'][^"']+["']/i)?.[0] || '', 'data-chatgpt-conversation-id')
    || snapshotUrl.match(/\/c\/([^?/#"']+)/i)?.[1]
    || sourceName;
  const title = genericTitle(sourceName, readMeta(html, 'rewind-title') || readTitle(html));
  const accountLabel = readMeta(html, 'rewind-account-label') || 'ChatGPT HTML import';
  const updatedAt = readMeta(html, 'rewind-updated-at') || undefined;
  const createdAt = readMeta(html, 'rewind-created-at') || updatedAt;

  const turns = collectChatgptTurns(html);
  const messages = turns.map((entry, index) => {
    const meta = readChatgptMessageMeta(entry.block);
    const role = meta?.role || readAttribute(entry.openingTag, 'data-turn') || (index % 2 === 0 ? 'user' : 'assistant');
    const text = extractChatgptTurnText(entry.block, role);
    return {
      id: meta?.messageId || readAttribute(entry.openingTag, 'data-turn-id') || `message-${index}`,
      role,
      text,
      createdAt: readAttribute(entry.block, 'datetime') || updatedAt,
      model: readAttribute(entry.block, 'data-message-model-slug') || readAttribute(entry.block, 'data-model') || undefined,
      metadata: { roleGuessed: !meta?.role, snapshotUrl }
    };
  }).filter((message) => message.text);

  const warnings = collectWarnings(html, messages, title);
  const detection = detectHtmlPlatform(sourceName, rawHtml);

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
  };
}

function parseGeminiHtml(sourceName, rawHtml) {
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

  const userBlocks = collectBalancedTagBlocks(html, 'user-query').map((entry) => ({ ...entry, role: 'user' }));
  const assistantBlocks = collectBalancedTagBlocks(html, 'message-content').map((entry) => ({ ...entry, role: 'assistant' }));
  const divTurns = [...html.matchAll(/<div[^>]*class=["'][^"']*gemini-turn[^"']*["'][^>]*>/gi)].map((match, index, arr) => ({
    index: match.index || 0,
    role: readAttribute(match[0], 'data-gemini-role') || (index % 2 === 0 ? 'user' : 'assistant'),
    block: html.slice(match.index || 0, arr[index + 1]?.index ?? html.length)
  }));
  const ordered = [...userBlocks, ...assistantBlocks, ...divTurns]
    .sort((left, right) => left.index - right.index)
    .filter((entry, index, arr) => index === 0 || entry.index !== arr[index - 1].index || entry.role !== arr[index - 1].role);

  const messages = ordered.map((entry, index) => {
    let preferred = entry.block;
    if (entry.role === 'user') {
      preferred = extractBalancedInnerBySelector(entry.block, /<div[^>]*id=["']user-query-content-[^"']+["'][^>]*>/i)
        || extractBalancedInnerBySelector(entry.block, /<div[^>]*class=["'][^"']*query-content[^"']*["'][^>]*>/i)
        || entry.block;
    } else {
      preferred = extractBalancedInnerBySelector(entry.block, /<div[^>]*class=["'][^"']*markdown-main-panel[^"']*["'][^>]*>/i)
        || extractBalancedInnerBySelector(entry.block, /<div[^>]*class=["'][^"']*model-response-text[^"']*["'][^>]*>/i)
        || entry.block;
    }
    return {
      id: readAttribute(entry.block, 'id') || readAttribute(entry.block, 'data-message-id') || `message-${index}`,
      role: entry.role,
      text: entry.role === 'user' ? stripGeminiLeadIn(decodeHtmlToText(preferred)) : decodeHtmlToText(preferred),
      createdAt: readAttribute(entry.block, 'datetime') || updatedAt,
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


function parseClaudeHtml(sourceName, rawHtml) {
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
      : extractBalancedInnerBySelector(slice, /<div[^>]*class=["'][^"']*font-claude-response[^"']*["'][^>]*>/i)
        || slice.match(/<p[^>]*class=["'][^"']*font-claude-response-body[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
        || slice;
    const text = htmlToMarkdownish(preferred)
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

function parseGrokHtml(sourceName, rawHtml) {
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
    const text = htmlToMarkdownish(preferred).trim();
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

export function parseHtmlImport(sourceName, html) {
  const detection = detectHtmlPlatform(sourceName, html);
  if (detection.platformGuess === 'chatgpt') return parseChatgptHtml(sourceName, html);
  if (detection.platformGuess === 'gemini') return parseGeminiHtml(sourceName, html);
  if (detection.platformGuess === 'claude') return parseClaudeHtml(sourceName, html);
  if (detection.platformGuess === 'grok') return parseGrokHtml(sourceName, html);
  throw new Error(`Unsupported HTML import source for ${sourceName}`);
}
