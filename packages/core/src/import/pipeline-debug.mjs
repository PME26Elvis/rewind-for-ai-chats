import { parseHtmlImport } from '../../../parsers/src/index.js';

function makeId(prefix, raw) {
  return `${prefix}:${raw}`;
}

function wordCountFromText(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function serializeTextContent(text) {
  return JSON.stringify([{ type: 'text', text }]);
}

function inferSourceKind(file) {
  if (file.sourceKind) return file.sourceKind;
  return /\.(html?|mhtml|mht)$/i.test(file.sourceName.toLowerCase()) ? 'html' : 'json';
}

function detectJsonPlatform(json) {
  if (json?.mapping && json?.current_node) return 'chatgpt';
  if (json?.platform === 'grok' || json?.grok || (Array.isArray(json?.responseNodes) && Array.isArray(json?.responses))) return 'grok';
  if (json?.platform === 'gemini') return 'gemini';
  if (Array.isArray(json?.messages) && json?.conversationId) return 'gemini';
  return undefined;
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
      .join('\n')
      .trim();
  }
  if (typeof content.text === 'string') return content.text.trim();
  return '';
}

function getChatgptActiveNodeId(parsed) {
  const mapping = parsed?.mapping || {};
  if (parsed?.current_node && mapping[parsed.current_node]) return parsed.current_node;
  const leaves = Object.values(mapping).filter((node) => node && (!Array.isArray(node.children) || node.children.length === 0));
  if (leaves.length > 0) return leaves[0].id;
  return Object.keys(mapping)[0];
}

function parseChatgptJsonMessages(parsed) {
  const mapping = parsed?.mapping || {};
  const path = [];
  const visited = new Set();
  let currentId = getChatgptActiveNodeId(parsed);

  while (currentId && mapping[currentId] && !visited.has(currentId)) {
    visited.add(currentId);
    const node = mapping[currentId];
    if (node?.message) {
      path.push({
        nodeId: node.id || currentId,
        messageId: node.message.id || node.id || currentId,
        role: node.message?.author?.role || 'assistant',
        text: extractChatgptText(node.message),
        createdAt: node.message?.create_time || parsed.create_time,
        model: node.message?.metadata?.model_slug,
        metadata: node.message?.metadata || {}
      });
    }
    currentId = node?.parent && mapping[node.parent] ? node.parent : null;
  }

  return path.reverse().filter((entry) => entry.text || entry.role === 'system');
}

function replaceGrokCitations(text, citations) {
  if (!text) return '';
  const citationMap = new Map();
  (Array.isArray(citations) ? citations : []).forEach((citation, index) => {
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

function parseGrokJsonMessages(parsed) {
  const responses = Array.isArray(parsed?.responses) ? parsed.responses : [];
  return responses
    .map((response, index) => {
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
    .filter((entry) => entry.text || entry.hasImages || entry.hasFiles);
}

function detectJsonCandidate(file) {
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

function detectCandidate(file) {
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

function canonicalizeChatgpt(file, detectedAt) {
  const parsed = JSON.parse(file.content);
  const visibleMessages = parseChatgptJsonMessages(parsed);
  const conversationId = makeId('chatgpt-conversation', parsed.conversation_id || parsed.id || file.sourceName);
  const accountId = makeId('account', `chatgpt:${parsed.account?.label || 'ChatGPT import'}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = visibleMessages.map((entry, index) => ({
    id: makeId('message', `${conversationId}:${entry.messageId || entry.nodeId || index}`),
    conversationId,
    branchId,
    parentMessageId: index > 0 ? makeId('message', `${conversationId}:${visibleMessages[index - 1].messageId || visibleMessages[index - 1].nodeId || index - 1}`) : undefined,
    role: entry.role || 'unknown',
    model: entry.model,
    contentBlocksJson: serializeTextContent(entry.text || ''),
    createdAt: entry.createdAt || parsed.create_time,
    wordCount: wordCountFromText(entry.text || ''),
    charCount: String(entry.text || '').length,
    hasCode: String(entry.text || '').includes('```'),
    hasImages: false,
    hasFiles: false,
    sourceMetadataJson: JSON.stringify({ sourceName: file.sourceName, originalNodeId: entry.nodeId, originalMessageId: entry.messageId, metadata: entry.metadata || {} })
  })).filter((message) => message.charCount > 0 || message.role === 'system');

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

function canonicalizeGemini(file, detectedAt) {
  const parsed = JSON.parse(file.content);
  const conversationId = makeId('gemini-conversation', parsed.conversationId || file.sourceName);
  const accountId = makeId('account', `gemini:${parsed.accountLabel || 'Gemini import'}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = parsed.messages.map((entry, index) => {
    const text = typeof entry.text === 'string' ? entry.text : '';
    return {
      id: makeId('message', `${conversationId}:${entry.id || index}`),
      conversationId,
      branchId,
      parentMessageId: index > 0 ? makeId('message', `${conversationId}:${parsed.messages[index - 1].id || index - 1}`) : undefined,
      role: entry.role || 'unknown',
      model: entry.model,
      contentBlocksJson: serializeTextContent(text),
      createdAt: entry.createdAt || parsed.createdAt,
      wordCount: wordCountFromText(text),
      charCount: text.length,
      hasCode: text.includes('```'),
      hasImages: false,
      hasFiles: false,
      sourceMetadataJson: JSON.stringify({ sourceName: file.sourceName, originalMessageId: entry.id || index })
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

function canonicalizeGrok(file, detectedAt) {
  const parsed = JSON.parse(file.content);
  const visibleMessages = parseGrokJsonMessages(parsed);
  const conversationId = makeId('grok-conversation', parsed.conversationId || file.sourceName);
  const accountId = makeId('account', `grok:${parsed.accountLabel || 'Grok import'}`);
  const branchId = makeId('branch', `${conversationId}:main`);

  const messages = visibleMessages.map((entry, index) => ({
    id: makeId('message', `${conversationId}:${entry.id}`),
    conversationId,
    branchId,
    parentMessageId: entry.parentId ? makeId('message', `${conversationId}:${entry.parentId}`) : (index > 0 ? makeId('message', `${conversationId}:${visibleMessages[index - 1].id}`) : undefined),
    role: entry.role,
    model: entry.model,
    contentBlocksJson: serializeTextContent(entry.text || ''),
    createdAt: entry.createdAt || parsed.createTime || parsed.createdAt,
    wordCount: wordCountFromText(entry.text || ''),
    charCount: String(entry.text || '').length,
    hasCode: String(entry.text || '').includes('```'),
    hasImages: !!entry.hasImages,
    hasFiles: !!entry.hasFiles,
    sourceMetadataJson: JSON.stringify({ sourceName: file.sourceName, originalMessageId: entry.id, metadata: entry.metadata || {} })
  })).filter((message) => message.charCount > 0 || message.hasImages || message.hasFiles);

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

function canonicalize(file, detectedAt) {
  if (inferSourceKind(file) === 'html') return canonicalizeHtml(file, detectedAt);
  const parsed = JSON.parse(file.content);
  const platform = detectJsonPlatform(parsed);
  if (platform === 'chatgpt') return canonicalizeChatgpt(file, detectedAt);
  if (platform === 'gemini') return canonicalizeGemini(file, detectedAt);
  if (platform === 'grok') return canonicalizeGrok(file, detectedAt);
  throw new Error(`Unsupported JSON schema in ${file.sourceName}`);
}

function formatDateSpan(rows) {
  const values = rows.map((row) => row.updatedAt).filter(Boolean).sort();
  if (values.length === 0) return 'Unknown';
  return `${values[0]} → ${values.at(-1)}`;
}

export function detectImportSources(files) {
  const reviewRows = files.map((file) => {
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

  const rollup = (key) => Object.fromEntries(reviewRows.reduce((map, row) => map.set(String(row[key]), (map.get(String(row[key])) || 0) + 1), new Map()));
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);
  const totalMessages = reviewRows.reduce((sum, row) => sum + row.messageCount, 0);
  const parserWarningsCount = reviewRows.reduce((sum, row) => sum + row.warnings.length, 0);

  const summary = {
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

export function executeImport(repository, files) {
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

  for (const file of files) {
    try {
      const canonical = canonicalize(file, detectedAt);
      const accountResult = repository.upsertAccount(canonical.account);
      const conversationResult = repository.upsertConversation(canonical.conversation);
      if (!accountResult.inserted && !conversationResult.inserted) mergedCount += 1;
      else importedCount += 1;
      for (const branch of canonical.branches) repository.upsertBranch(branch);
      for (const message of canonical.messages) repository.upsertMessage(message);
      skippedCount += conversationResult.inserted ? 0 : 1;
      parserWarningsCount += canonical.warnings.length;
    } catch {
      failedCount += 1;
    }
  }

  const result = { importJobId, importedCount, mergedCount, skippedCount, failedCount, parserWarningsCount, libraryCount: repository.listLibraryConversations().length };
  repository.updateImportJob(importJobId, { finishedAt: new Date().toISOString(), status: failedCount > 0 ? 'failed' : mergedCount > 0 ? 'completed_with_duplicates' : 'completed', resultStatsJson: JSON.stringify(result) });
  return result;
}

export const executeJsonImport = executeImport;

export { canonicalize };
