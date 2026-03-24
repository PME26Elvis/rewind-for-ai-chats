import type { AccountRecord, ConversationRecord } from '../schema/archive';
import type { Platform } from '@rewind/shared';
import { parseHtmlImport, type ParserWarningCode } from '../../../parsers/src/index.js';

export interface BranchRecord {
  id: string;
  conversationId: string;
  rootMessageId?: string;
  leafMessageId?: string;
  derivedFromBranchId?: string;
  branchDepth: number;
  isLatest: boolean;
  branchLabel?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  branchId?: string;
  parentMessageId?: string;
  role: string;
  model?: string;
  contentBlocksJson: string;
  createdAt?: string;
  editedAt?: string;
  wordCount: number;
  charCount: number;
  hasCode: boolean;
  hasImages: boolean;
  hasFiles: boolean;
  sourceMetadataJson?: string;
}

export interface ImportJobRecord {
  id: string;
  jobType: 'json_import' | 'html_import';
  platform?: Platform;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'completed_with_duplicates' | 'failed';
  preFiltersJson?: string;
  detectStatsJson?: string;
  resultStatsJson?: string;
  errorReportPath?: string;
}

export interface ImportSourceFile {
  sourceName: string;
  content: string;
  sourceKind?: 'json' | 'html';
}

export interface DetectionCandidate {
  sourceName: string;
  sourceKind: 'json' | 'html';
  platform: Platform;
  title: string;
  accountLabel: string;
  updatedAt?: string;
  messageCount: number;
  branchCount: number;
  confidence: number;
  warnings: ParserWarningCode[];
}

export interface DetectSummary {
  totalDetected: number;
  estimatedSize: string;
  estimatedProcessingTime: string;
  dateSpan: string;
  imageContainingCount: number;
  branchHeavyCount: number;
  parserWarningsCount: number;
  lowConfidenceCount: number;
  platformBreakdown: Record<string, number>;
  accountBreakdown: Record<string, number>;
  sourceKindBreakdown: Record<string, number>;
  sampleTitles: string[];
}

export interface ReviewRow {
  sourceName: string;
  sourceKind: 'json' | 'html';
  title: string;
  platform: Platform;
  accountLabel: string;
  branchMode: 'latest_only' | 'full_history';
  confidence: number;
  messageCount: number;
  branchCount: number;
  updatedAt?: string;
  warnings: ParserWarningCode[];
}

export interface ImportResultSummary {
  importJobId: string;
  importedCount: number;
  mergedCount: number;
  skippedCount: number;
  failedCount: number;
  parserWarningsCount: number;
  libraryCount: number;
}

export interface LibraryConversationSummary {
  id: string;
  title: string;
  platform: Platform;
  accountLabel: string;
  updatedAt?: string;
  messageCount: number;
  branchCount: number;
}

export interface ArchiveRepository {
  upsertAccount(account: AccountRecord): { inserted: boolean; id: string };
  upsertConversation(conversation: ConversationRecord): { inserted: boolean; id: string };
  upsertBranch(branch: BranchRecord): { inserted: boolean; id: string };
  upsertMessage(message: MessageRecord): { inserted: boolean; id: string };
  insertImportJob(job: ImportJobRecord): void;
  updateImportJob(jobId: string, patch: Partial<ImportJobRecord>): void;
  listLibraryConversations(): LibraryConversationSummary[];
}

interface CanonicalConversationBundle {
  account: AccountRecord;
  conversation: ConversationRecord;
  branches: BranchRecord[];
  messages: MessageRecord[];
  warnings: ParserWarningCode[];
}

function makeId(prefix: string, raw: string) {
  return `${prefix}:${raw}`;
}

function wordCountFromText(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function serializeTextContent(text: string) {
  return JSON.stringify([{ type: 'text', text }]);
}

function inferSourceKind(file: ImportSourceFile) {
  if (file.sourceKind) return file.sourceKind;
  return /\.(html?|mhtml|mht)$/i.test(file.sourceName.toLowerCase()) ? 'html' : 'json';
}

function detectJsonPlatform(json: any): Platform | undefined {
  if (json?.mapping && json?.current_node) return 'chatgpt';
  if (json?.platform === 'grok' || json?.grok || (Array.isArray(json?.responseNodes) && Array.isArray(json?.responses))) return 'grok';
  if (json?.platform === 'gemini') return 'gemini';
  if (Array.isArray(json?.messages) && json?.conversationId) return 'gemini';
  return undefined;
}

function extractThinkingAndContent(text: string) {
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
    content: content
      .replace(/<\/?thinking>/gi, '')
      .replace(/<\/?content>/gi, '')
      .trim()
  };
}

function extractChatgptText(message: any) {
  const content = message?.content || {};
  if (Array.isArray(content.parts)) {
    return content.parts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof content.text === 'string') return content.text.trim();
  if (typeof content.content === 'string') return content.content.trim();
  return '';
}

function extractChatgptReasoningRecap(content: any) {
  if (!content) return '';
  if (Array.isArray(content.parts)) return content.parts.join('').trim();
  if (typeof content.content === 'string') return content.content.trim();
  if (typeof content.text === 'string') return content.text.trim();
  return '';
}

function extractChatgptThoughts(content: any) {
  if (!Array.isArray(content?.thoughts)) return '';
  return content.thoughts.map((thought) => {
    const parts = [];
    if (thought?.summary) parts.push(String(thought.summary).trim());
    if (thought?.content) parts.push(String(thought.content).trim());
    return parts.filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n').trim();
}

function getChatgptActiveNodeId(parsed: any) {
  const mapping = parsed?.mapping || {};
  if (parsed?.current_node && mapping[parsed.current_node]) return parsed.current_node;
  const leaves = Object.values(mapping).filter((node) => node && (!Array.isArray(node.children) || node.children.length === 0));
  if (leaves.length > 0) return leaves[0].id;
  return Object.keys(mapping)[0];
}

function parseChatgptJsonMessages(parsed: any) {
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

    const role = message?.author?.role || 'assistant';
    const content = message?.content || {};
    const contentType = content?.content_type || '';
    const baseMeta = message?.metadata || {};

    if (role === 'user') {
      pendingThinking = '';
      pendingRecap = '';
      const rawText = extractChatgptText(message);
      const split = extractThinkingAndContent(rawText);
      if (split.content || role === 'system') {
        messages.push({
          nodeId: node.id || nodeId,
          messageId: message.id || node.id || nodeId,
          role,
          text: split.content,
          thinking: split.thinking,
          createdAt: message?.create_time || parsed.create_time,
          model: message?.metadata?.model_slug,
          metadata: baseMeta
        });
      }
      continue;
    }

    if (role === 'assistant') {
      if (contentType === 'model_editable_context') {
        pendingThinking = '';
        pendingRecap = '';
        continue;
      }
      if (contentType === 'thoughts') {
        const thoughtText = extractChatgptThoughts(content);
        if (thoughtText) pendingThinking = pendingThinking ? `${pendingThinking}\n\n${thoughtText}` : thoughtText;
        continue;
      }
      if (contentType === 'reasoning_recap') {
        pendingRecap = extractChatgptReasoningRecap(content);
        continue;
      }

      const rawText = extractChatgptText(message);
      const split = extractThinkingAndContent(rawText);
      const thinkingParts = [pendingRecap, pendingThinking, split.thinking].filter(Boolean);
      messages.push({
        nodeId: node.id || nodeId,
        messageId: message.id || node.id || nodeId,
        role,
        text: split.content,
        thinking: thinkingParts.join('\n\n').trim(),
        createdAt: message?.create_time || parsed.create_time,
        model: message?.metadata?.model_slug,
        metadata: baseMeta
      });
      pendingThinking = '';
      pendingRecap = '';
      continue;
    }

    const rawText = extractChatgptText(message);
    const split = extractThinkingAndContent(rawText);
    if (split.content || role === 'system') {
      messages.push({
        nodeId: node.id || nodeId,
        messageId: message.id || node.id || nodeId,
        role,
        text: split.content,
        thinking: split.thinking,
        createdAt: message?.create_time || parsed.create_time,
        model: message?.metadata?.model_slug,
        metadata: baseMeta
      });
    }
  }

  return messages.filter((entry) => entry.text || entry.thinking || entry.role === 'system');
}

function replaceGrokCitations(text: string, citations: any[]) {
  if (!text) return '';
  const citationMap = new Map<string, { title: string; url: string }>();
  (Array.isArray(citations) ? citations : []).forEach((citation: any, index: number) => {
    const key = citation?.id || citation?.cardId || `citation-${index}`;
    citationMap.set(key, {
      title: citation?.title || citation?.displayName || 'Source',
      url: citation?.url || citation?.sourceUrl || ''
    });
  });

  return String(text)
    .replace(/<grok:render\s+card_id=\"([^\"]+)\"[\s\S]*?<\/grok:render>/gi, (_match, cardId) => {
      const citation = citationMap.get(cardId);
      if (!citation?.url) return citation?.title || '';
      const escapedTitle = String(citation.title || 'Source').replace(/([\[\]])/g, '\\$1');
      return `[${escapedTitle}](${citation.url})`;
    })
    .replace(/<grok:render[\s\S]*?<\/grok:render>/gi, '')
    .trim();
}

function parseGrokJsonMessages(parsed: any) {
  const responses = Array.isArray(parsed?.responses) ? parsed.responses : [];
  return responses
    .map((response: any, index: number) => {
      const text = replaceGrokCitations(response?.message || '', response?.citations || response?.citedWebSearchResults);
      const hasImages = (Array.isArray(response?.generatedImageUrls) && response.generatedImageUrls.length > 0)
        || (Array.isArray(response?.imageAttachments) && response.imageAttachments.length > 0)
        || (Array.isArray(response?.capturedImages) && response.capturedImages.length > 0);
      const hasFiles = Array.isArray(response?.fileAttachments) && response.fileAttachments.length > 0;
      return {
        id: response?.responseId || `response-${index}`,
        parentId: response?.parentResponseId,
        role: response?.sender === 'human' ? 'user' : (response?.sender || 'assistant'),
        text,
        createdAt: response?.createTime || parsed?.createTime || parsed?.createdAt,
        model: response?.metadata?.requestModelDetails?.modelId || response?.model,
        hasImages,
        hasFiles,
        metadata: {
          citations: response?.citations || response?.citedWebSearchResults || [],
          webSearchResults: response?.webSearchResults || [],
          attachments: response?.fileAttachments || []
        }
      };
    })
    .filter((entry: any) => entry.text || entry.hasImages || entry.hasFiles);
}


function buildPreparedImport(file: ImportSourceFile) {
  const sourceKind = inferSourceKind(file);

  if (sourceKind === 'html') {
    const parsedHtml = parseHtmlImport(file.sourceName, file.content);
    return {
      file,
      sourceKind,
      platform: parsedHtml.platform,
      parsedJson: null,
      parsedHtml,
      visibleMessages: null,
      candidate: {
        sourceName: file.sourceName,
        sourceKind: 'html',
        platform: parsedHtml.platform,
        title: parsedHtml.title,
        accountLabel: parsedHtml.accountLabel,
        updatedAt: parsedHtml.updatedAt || parsedHtml.createdAt,
        messageCount: parsedHtml.messages.length,
        branchCount: 1,
        confidence: parsedHtml.confidence,
        warnings: parsedHtml.warnings
      }
    };
  }

  const parsedJson = JSON.parse(file.content);
  const platform = detectJsonPlatform(parsedJson);
  if (!platform) throw new Error(`Unsupported JSON fixture shape for ${file.sourceName}`);

  let visibleMessages: any[] | null = null;
  let candidate: any;

  if (platform === 'chatgpt') {
    visibleMessages = parseChatgptJsonMessages(parsedJson);
    candidate = {
      sourceName: file.sourceName,
      sourceKind: 'json',
      platform: 'chatgpt',
      title: parsedJson.title || file.sourceName,
      accountLabel: parsedJson.account?.label || 'ChatGPT import',
      updatedAt: parsedJson.update_time || parsedJson.create_time,
      messageCount: visibleMessages.length,
      branchCount: 1,
      confidence: 0.99,
      warnings: []
    };
  } else if (platform === 'gemini') {
    candidate = {
      sourceName: file.sourceName,
      sourceKind: 'json',
      platform: 'gemini',
      title: parsedJson.title || file.sourceName,
      accountLabel: parsedJson.accountLabel || 'Gemini import',
      updatedAt: parsedJson.updatedAt || parsedJson.createdAt,
      messageCount: Array.isArray(parsedJson.messages) ? parsedJson.messages.length : 0,
      branchCount: 1,
      confidence: 0.97,
      warnings: []
    };
  } else if (platform === 'grok') {
    visibleMessages = parseGrokJsonMessages(parsedJson);
    candidate = {
      sourceName: file.sourceName,
      sourceKind: 'json',
      platform: 'grok',
      title: parsedJson.title || file.sourceName,
      accountLabel: parsedJson.accountLabel || 'Grok import',
      updatedAt: parsedJson.updatedAt || parsedJson.createTime || parsedJson.createdAt,
      messageCount: visibleMessages.length,
      branchCount: 1,
      confidence: 0.98,
      warnings: []
    };
  } else {
    throw new Error(`Unsupported JSON fixture shape for ${file.sourceName}`);
  }

  return {
    file,
    sourceKind,
    platform,
    parsedJson,
    parsedHtml: null,
    visibleMessages,
    candidate
  };
}

function getPreparedImport(file: ImportSourceFile) {
  if (PREPARED_IMPORT_CACHE.has(file as object)) return PREPARED_IMPORT_CACHE.get(file as object);
  const prepared = buildPreparedImport(file);
  PREPARED_IMPORT_CACHE.set(file as object, prepared);
  return prepared;
}

function detectJsonCandidate(file: ImportSourceFile): DetectionCandidate {
  const parsed = JSON.parse(file.content);
  const platform = detectJsonPlatform(parsed);

  if (platform === 'chatgpt') {
    const messages = parseChatgptJsonMessages(parsed);
    return {
      sourceName: file.sourceName,
      sourceKind: 'json',
      platform: 'chatgpt',
      title: parsed.title || file.sourceName,
      accountLabel: parsed.account?.label || 'ChatGPT import',
      updatedAt: parsed.update_time || parsed.create_time,
      messageCount: messages.length,
      branchCount: 1,
      confidence: 0.99,
      warnings: []
    };
  }

  if (platform === 'gemini') {
    return {
      sourceName: file.sourceName,
      sourceKind: 'json',
      platform: 'gemini',
      title: parsed.title || file.sourceName,
      accountLabel: parsed.accountLabel || 'Gemini import',
      updatedAt: parsed.updatedAt || parsed.createdAt,
      messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
      branchCount: 1,
      confidence: 0.97,
      warnings: []
    };
  }

  if (platform === 'grok') {
    const messages = parseGrokJsonMessages(parsed);
    return {
      sourceName: file.sourceName,
      sourceKind: 'json',
      platform: 'grok',
      title: parsed.title || file.sourceName,
      accountLabel: parsed.accountLabel || 'Grok import',
      updatedAt: parsed.updatedAt || parsed.createTime || parsed.createdAt,
      messageCount: messages.length,
      branchCount: 1,
      confidence: 0.98,
      warnings: []
    };
  }

  throw new Error(`Unsupported JSON fixture shape for ${file.sourceName}`);
}

function detectCandidate(file: ImportSourceFile): DetectionCandidate {
  if (inferSourceKind(file) === 'html') {
    const parsed = parseHtmlImport(file.sourceName, file.content);
    return {
      sourceName: file.sourceName,
      sourceKind: 'html',
      platform: parsed.platform,
      title: parsed.title,
      accountLabel: parsed.accountLabel,
      updatedAt: parsed.updatedAt || parsed.createdAt,
      messageCount: parsed.messages.length,
      branchCount: 1,
      confidence: parsed.confidence,
      warnings: parsed.warnings
    };
  }

  return detectJsonCandidate(file);
}

function canonicalizeChatgpt(file: ImportSourceFile, detectedAt: string): CanonicalConversationBundle {
  const parsed = JSON.parse(file.content);
  const visibleMessages = parseChatgptJsonMessages(parsed);
  const conversationId = makeId('chatgpt-conversation', parsed.conversation_id || parsed.id || file.sourceName);
  const accountId = makeId('account', `chatgpt:${parsed.account?.label || 'ChatGPT import'}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = visibleMessages.map((entry, index) => {
    const split = extractThinkingAndContent(entry.text || '');
    return {
      id: makeId('message', `${conversationId}:${entry.messageId || entry.nodeId || index}`),
      conversationId,
      branchId,
      parentMessageId: index > 0 ? makeId('message', `${conversationId}:${visibleMessages[index - 1].messageId || visibleMessages[index - 1].nodeId || index - 1}`) : undefined,
      role: entry.role || 'unknown',
      model: entry.model,
      contentBlocksJson: serializeTextContent(split.content || ''),
      createdAt: entry.createdAt || parsed.create_time,
      wordCount: wordCountFromText(split.content || ''),
      charCount: String(split.content || '').length,
      hasCode: String(split.content || '').includes('```'),
      hasImages: false,
      hasFiles: false,
      sourceMetadataJson: JSON.stringify({ sourceName: file.sourceName, originalNodeId: entry.nodeId, originalMessageId: entry.messageId, thinking: entry.thinking || split.thinking || '', metadata: entry.metadata || {} })
    };
  }).filter((message) => message.charCount > 0 || message.role === 'system');

  return {
    account: { id: accountId, platform: 'chatgpt', displayLabel: parsed.account?.label || 'ChatGPT import', createdAt: detectedAt, updatedAt: detectedAt },
    conversation: {
      id: conversationId,
      platform: 'chatgpt',
      accountId,
      title: parsed.title || file.sourceName,
      sourceType: 'json_export',
      sourceRef: file.sourceName,
      favorite: false,
      createdAt: parsed.create_time,
      updatedAt: parsed.update_time || parsed.create_time,
      importedAt: detectedAt,
      syncFingerprint: `chatgpt:${parsed.conversation_id || parsed.id || file.sourceName}`,
      parseConfidence: 0.99,
      rawJsonPath: file.sourceName,
      statsJson: JSON.stringify({ messageCount: messages.length, branchCount: 1 })
    },
    branches: [{ id: branchId, conversationId, rootMessageId: messages[0]?.id, leafMessageId: messages.at(-1)?.id, branchDepth: 0, isLatest: true, branchLabel: 'Main', createdAt: parsed.create_time, updatedAt: parsed.update_time || parsed.create_time }],
    messages,
    warnings: []
  };
}

function canonicalizeGemini(file: ImportSourceFile, detectedAt: string): CanonicalConversationBundle {
  const parsed = JSON.parse(file.content);
  const conversationId = makeId('gemini-conversation', parsed.conversationId || file.sourceName);
  const accountId = makeId('account', `gemini:${parsed.accountLabel || 'Gemini import'}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = parsed.messages.map((entry, index) => {
    const rawText = typeof entry.text === 'string' ? entry.text : '';
    const split = extractThinkingAndContent(rawText);
    return {
      id: makeId('message', `${conversationId}:${entry.id || index}`),
      conversationId,
      branchId,
      parentMessageId: index > 0 ? makeId('message', `${conversationId}:${parsed.messages[index - 1].id || index - 1}`) : undefined,
      role: entry.role || 'unknown',
      model: entry.model,
      contentBlocksJson: serializeTextContent(split.content),
      createdAt: entry.createdAt || parsed.createdAt,
      wordCount: wordCountFromText(split.content),
      charCount: split.content.length,
      hasCode: split.content.includes('```'),
      hasImages: false,
      hasFiles: false,
      sourceMetadataJson: JSON.stringify({ sourceName: file.sourceName, originalMessageId: entry.id || index, thinking: split.thinking || '' })
    };
  });

  return {
    account: { id: accountId, platform: 'gemini', displayLabel: parsed.accountLabel || 'Gemini import', createdAt: detectedAt, updatedAt: detectedAt },
    conversation: {
      id: conversationId,
      platform: 'gemini',
      accountId,
      title: parsed.title || file.sourceName,
      sourceType: 'json_export',
      sourceRef: file.sourceName,
      favorite: false,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt || parsed.createdAt,
      importedAt: detectedAt,
      syncFingerprint: `gemini:${parsed.conversationId || file.sourceName}`,
      parseConfidence: 0.97,
      rawJsonPath: file.sourceName,
      statsJson: JSON.stringify({ messageCount: messages.length, branchCount: 1 })
    },
    branches: [{ id: branchId, conversationId, rootMessageId: messages[0]?.id, leafMessageId: messages.at(-1)?.id, branchDepth: 0, isLatest: true, branchLabel: 'Main', createdAt: parsed.createdAt, updatedAt: parsed.updatedAt || parsed.createdAt }],
    messages,
    warnings: []
  };
}

function canonicalizeGrok(file: ImportSourceFile, detectedAt: string): CanonicalConversationBundle {
  const parsed = JSON.parse(file.content);
  const visibleMessages = parseGrokJsonMessages(parsed);
  const conversationId = makeId('grok-conversation', parsed.conversationId || file.sourceName);
  const accountId = makeId('account', `grok:${parsed.accountLabel || 'Grok import'}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = visibleMessages.map((entry, index) => {
    const split = extractThinkingAndContent(entry.text || '');
    return {
      id: makeId('message', `${conversationId}:${entry.id}`),
      conversationId,
      branchId,
      parentMessageId: entry.parentId ? makeId('message', `${conversationId}:${entry.parentId}`) : (index > 0 ? makeId('message', `${conversationId}:${visibleMessages[index - 1].id}`) : undefined),
      role: entry.role,
      model: entry.model,
      contentBlocksJson: serializeTextContent(split.content || ''),
      createdAt: entry.createdAt || parsed.createTime || parsed.createdAt,
      wordCount: wordCountFromText(split.content || ''),
      charCount: String(split.content || '').length,
      hasCode: String(split.content || '').includes('```'),
      hasImages: !!entry.hasImages,
      hasFiles: !!entry.hasFiles,
      sourceMetadataJson: JSON.stringify({ sourceName: file.sourceName, originalMessageId: entry.id, thinking: split.thinking || '', metadata: entry.metadata || {} })
    };
  }).filter((message) => message.charCount > 0 || message.hasImages || message.hasFiles);

  return {
    account: { id: accountId, platform: 'grok', displayLabel: parsed.accountLabel || 'Grok import', createdAt: detectedAt, updatedAt: detectedAt },
    conversation: {
      id: conversationId,
      platform: 'grok',
      accountId,
      title: parsed.title || file.sourceName,
      sourceType: 'json_export',
      sourceRef: file.sourceName,
      favorite: false,
      createdAt: parsed.createTime || parsed.createdAt,
      updatedAt: messages.at(-1)?.createdAt || parsed.createTime || parsed.createdAt,
      importedAt: detectedAt,
      syncFingerprint: `grok:${parsed.conversationId || file.sourceName}`,
      parseConfidence: 0.98,
      rawJsonPath: file.sourceName,
      statsJson: JSON.stringify({ messageCount: messages.length, branchCount: 1 })
    },
    branches: [{ id: branchId, conversationId, rootMessageId: messages[0]?.id, leafMessageId: messages.at(-1)?.id, branchDepth: 0, isLatest: true, branchLabel: 'Main', createdAt: parsed.createTime || parsed.createdAt, updatedAt: messages.at(-1)?.createdAt || parsed.createTime || parsed.createdAt }],
    messages,
    warnings: []
  };
}

function canonicalizeHtml(file: ImportSourceFile, detectedAt: string): CanonicalConversationBundle {
  const parsed = parseHtmlImport(file.sourceName, file.content);
  const conversationId = makeId(`${parsed.platform}-conversation`, parsed.conversationId);
  const accountId = makeId('account', `${parsed.platform}:${parsed.accountLabel}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = parsed.messages.map((entry, index) => {
    const split = extractThinkingAndContent(entry.text || '');
    return {
      id: makeId('message', `${conversationId}:${entry.id}`),
      conversationId,
      branchId,
      parentMessageId: index > 0 ? makeId('message', `${conversationId}:${parsed.messages[index - 1].id}`) : undefined,
      role: entry.role,
      model: entry.model,
      contentBlocksJson: serializeTextContent(split.content),
      createdAt: entry.createdAt || parsed.createdAt,
      wordCount: wordCountFromText(split.content),
      charCount: split.content.length,
      hasCode: split.content.includes('```'),
      hasImages: /\[(image|img)\]/i.test(split.content),
      hasFiles: false,
      sourceMetadataJson: JSON.stringify({ rawHtmlPath: file.sourceName, originalMessageId: entry.id, thinking: entry.thinking || split.thinking || '', parserWarnings: parsed.warnings, parserMetadata: entry.metadata, sourceMetadata: parsed.metadata })
    };
  });

  return {
    account: { id: accountId, platform: parsed.platform, displayLabel: parsed.accountLabel, createdAt: detectedAt, updatedAt: detectedAt },
    conversation: {
      id: conversationId,
      platform: parsed.platform,
      accountId,
      title: parsed.title,
      sourceType: 'html_import',
      sourceRef: file.sourceName,
      favorite: false,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt || parsed.createdAt,
      importedAt: detectedAt,
      syncFingerprint: `${parsed.platform}:html:${parsed.conversationId}`,
      parseConfidence: parsed.confidence,
      rawHtmlPath: parsed.rawHtmlPath,
      statsJson: JSON.stringify({ messageCount: messages.length, branchCount: 1, parserWarnings: parsed.warnings })
    },
    branches: [{ id: branchId, conversationId, rootMessageId: messages[0]?.id, leafMessageId: messages.at(-1)?.id, branchDepth: 0, isLatest: true, branchLabel: 'Imported HTML branch', createdAt: parsed.createdAt, updatedAt: parsed.updatedAt || parsed.createdAt }],
    messages,
    warnings: parsed.warnings
  };
}

function canonicalize(prepared: any, detectedAt: string) {
  if (prepared.sourceKind === 'html') return canonicalizeHtml(prepared, detectedAt);
  if (prepared.platform === 'chatgpt') return canonicalizeChatgpt(prepared, detectedAt);
  if (prepared.platform === 'gemini') return canonicalizeGemini(prepared, detectedAt);
  if (prepared.platform === 'grok') return canonicalizeGrok(prepared, detectedAt);
  throw new Error(`Unsupported import schema in ${prepared.file?.sourceName || 'unknown source'}`);
}

function formatDateSpan(rows: DetectionCandidate[]) {
  const values = rows.map((row) => row.updatedAt).filter(Boolean).sort() as string[];
  if (values.length === 0) return 'Unknown';
  return `${values[0]} → ${values.at(-1)}`;
}

export function detectImportSources(files: ImportSourceFile[]) {
  const reviewRows: ReviewRow[] = files.map((file) => {
    const candidate = detectCandidate(file);
    return {
      sourceName: candidate.sourceName,
      sourceKind: candidate.sourceKind,
      title: candidate.title,
      platform: candidate.platform,
      accountLabel: candidate.accountLabel,
      branchMode: 'full_history',
      confidence: candidate.confidence,
      messageCount: candidate.messageCount,
      branchCount: candidate.branchCount,
      updatedAt: candidate.updatedAt,
      warnings: candidate.warnings
    };
  });

  const rollup = (key: keyof Pick<ReviewRow, 'platform' | 'accountLabel' | 'sourceKind'>) => Object.fromEntries(reviewRows.reduce((map, row) => map.set(String(row[key]), (map.get(String(row[key])) || 0) + 1), new Map<string, number>()));
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);
  const totalMessages = reviewRows.reduce((sum, row) => sum + row.messageCount, 0);
  const parserWarningsCount = reviewRows.reduce((sum, row) => sum + row.warnings.length, 0);

  const summary: DetectSummary = {
    totalDetected: reviewRows.length,
    estimatedSize: `${(totalBytes / 1024).toFixed(1)} KB`,
    estimatedProcessingTime: `${Math.max(1, reviewRows.length)}s`,
    dateSpan: formatDateSpan(reviewRows),
    imageContainingCount: 0,
    branchHeavyCount: reviewRows.filter((row) => row.branchCount > 1).length,
    parserWarningsCount,
    lowConfidenceCount: reviewRows.filter((row) => row.confidence < 0.8).length,
    platformBreakdown: rollup('platform'),
    accountBreakdown: rollup('accountLabel'),
    sourceKindBreakdown: rollup('sourceKind'),
    sampleTitles: reviewRows.slice(0, 3).map((row) => row.title)
  };

  return { summary, reviewRows, totalMessages };
}

export function executeImport(repository: ArchiveRepository, files: ImportSourceFile[]): ImportResultSummary {
  const detectedAt = new Date().toISOString();
  const detection = detectImportSources(files);
  const sourceKinds = [...new Set(files.map(inferSourceKind))];
  const importJobId = makeId('import-job', `${detectedAt}:${files.length}`);
  repository.insertImportJob({
    id: importJobId,
    jobType: sourceKinds.every((kind) => kind === 'html') ? 'html_import' : 'json_import',
    startedAt: detectedAt,
    status: 'running',
    detectStatsJson: JSON.stringify(detection.summary)
  });

  let importedCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let parserWarningsCount = 0;

  for (const prepared of preparedList) {
    try {
      const canonical = canonicalize(prepared, detectedAt);
      const accountResult = repository.upsertAccount(canonical.account);
      const conversationResult = repository.upsertConversation(canonical.conversation);
      if (!accountResult.inserted && !conversationResult.inserted) {
        mergedCount += 1;
      } else {
        importedCount += 1;
      }
      for (const branch of canonical.branches) repository.upsertBranch(branch);
      for (const message of canonical.messages) repository.upsertMessage(message);
      skippedCount += conversationResult.inserted ? 0 : 1;
      parserWarningsCount += canonical.warnings.length;
    } catch {
      failedCount += 1;
    }
  }

  const result: ImportResultSummary = {
    importJobId,
    importedCount,
    mergedCount,
    skippedCount,
    failedCount,
    parserWarningsCount,
    libraryCount: repository.listLibraryConversations().length
  };

  repository.updateImportJob(importJobId, {
    finishedAt: new Date().toISOString(),
    status: failedCount > 0 ? 'failed' : mergedCount > 0 ? 'completed_with_duplicates' : 'completed',
    resultStatsJson: JSON.stringify(result)
  });

  return result;
}

export const executeJsonImport = executeImport;
