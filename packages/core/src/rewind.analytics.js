const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'your', 'about', 'into', 'then', 'than', 'them', 'they', 'their', 'there', 'would', 'could', 'should', 'what', 'when', 'where', 'which', 'while', 'were', 'been', 'being', 'also', 'just', 'like', 'some', 'more', 'very', 'over', 'using', 'used', 'use', 'you', 'are', 'was', 'how', 'why', 'can', 'let', 'our', 'out', 'not', 'but', 'too', 'its', 'it', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'as', 'is', 'be', 'or', 'if', 'by', 'we', 'i', 'me', 'my'
]);

const PLATFORM_ORDER = ['chatgpt', 'gemini', 'grok', 'claude'];

export function extractTextFromContentBlocks(contentBlocksJson) {
  try {
    const blocks = JSON.parse(contentBlocksJson);
    if (!Array.isArray(blocks)) return '';
    return blocks.map((block) => {
      if (typeof block === 'string') return block;
      if (block.type === 'text' || block.type === 'code') return block.text || '';
      if (block.type === 'image') return block.alt || block.url || '';
      if (block.type === 'file') return block.filename || block.url || '';
      return block.text || '';
    }).join(' ');
  } catch {
    return '';
  }
}

function toMonthKey(value) {
  return value ? value.slice(0, 7) : undefined;
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function pickConversationDate(conversation) {
  return conversation.updatedAt || conversation.createdAt || conversation.importedAt;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildYearRange(monthKeys, selectedYear) {
  if (selectedYear === 'all') return [...monthKeys].sort();
  return Array.from({ length: 12 }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, '0')}`);
}

function createEmptyMonthSeries(monthKeys, selectedYear) {
  return buildYearRange(monthKeys, selectedYear).map((key) => ({ key, label: monthLabel(key), value: 0 }));
}

function accountShadeIndex(accountId, accountIdsByPlatform) {
  for (const [platform, ids] of accountIdsByPlatform.entries()) {
    const index = ids.indexOf(accountId);
    if (index >= 0) return { platform, shadeIndex: index };
  }
  return { platform: undefined, shadeIndex: 0 };
}

function tokenize(text) {
  const latin = String(text || '').toLowerCase().match(/[a-z0-9']{3,}/g) || [];
  const cjk = String(text || '').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu) || [];
  return [...latin, ...cjk].filter((token) => !STOPWORDS.has(token));
}

function compareTotals(current, previous) {
  return {
    previousYear: previous?.year,
    conversationsDelta: current.conversations - (previous?.conversations || 0),
    messagesDelta: current.messages - (previous?.messages || 0),
    wordsDelta: current.words - (previous?.words || 0)
  };
}

function computeYearTotals(snapshot, year) {
  const conversations = Object.values(snapshot.conversations).filter((conversation) => pickConversationDate(conversation)?.startsWith(String(year)));
  const ids = new Set(conversations.map((conversation) => conversation.id));
  const messages = Object.values(snapshot.messages).filter((message) => ids.has(message.conversationId));
  return {
    year,
    conversations: conversations.length,
    messages: messages.length,
    words: messages.reduce((sum, message) => sum + (message.wordCount || 0), 0)
  };
}

export function computeRewindAnalytics(snapshot, selectedYear = 'all') {
  const conversations = Object.values(snapshot.conversations || {});
  const branches = Object.values(snapshot.branches || {});
  const messages = Object.values(snapshot.messages || {});

  const availableYears = Array.from(new Set(conversations
    .map((conversation) => pickConversationDate(conversation)?.slice(0, 4))
    .filter(Boolean)
    .map((year) => Number(year))))
    .sort((left, right) => right - left);

  const conversationFilter = (conversation) => {
    const year = pickConversationDate(conversation)?.slice(0, 4);
    return selectedYear === 'all' || year === String(selectedYear);
  };

  const filteredConversations = conversations.filter(conversationFilter);
  const conversationIds = new Set(filteredConversations.map((conversation) => conversation.id));
  const filteredBranches = branches.filter((branch) => conversationIds.has(branch.conversationId));
  const filteredMessages = messages.filter((message) => conversationIds.has(message.conversationId));

  const messagesByConversation = filteredMessages.reduce((map, message) => {
    map.set(message.conversationId, (map.get(message.conversationId) || 0) + 1);
    return map;
  }, new Map());

  const wordsByConversation = filteredMessages.reduce((map, message) => {
    map.set(message.conversationId, (map.get(message.conversationId) || 0) + (message.wordCount || 0));
    return map;
  }, new Map());

  const branchesByConversation = filteredBranches.reduce((map, branch) => {
    map.set(branch.conversationId, (map.get(branch.conversationId) || 0) + 1);
    return map;
  }, new Map());

  const messageMonthCounts = new Map();
  const conversationMonthCounts = new Map();
  const platformCounts = new Map();
  const accountCounts = new Map();
  const branchDistribution = new Map();
  const wordCounts = new Map();
  const imageCounts = new Map();
  const accountIdsByPlatform = new Map();
  let codeMessageCount = 0;
  let imageMessageCount = 0;
  let fileMessageCount = 0;

  for (const conversation of filteredConversations) {
    const monthKey = toMonthKey(pickConversationDate(conversation));
    if (monthKey) conversationMonthCounts.set(monthKey, (conversationMonthCounts.get(monthKey) || 0) + 1);
    platformCounts.set(conversation.platform, (platformCounts.get(conversation.platform) || 0) + 1);
    accountCounts.set(conversation.accountId, (accountCounts.get(conversation.accountId) || 0) + 1);
    const platformAccounts = accountIdsByPlatform.get(conversation.platform) || [];
    if (!platformAccounts.includes(conversation.accountId)) platformAccounts.push(conversation.accountId);
    accountIdsByPlatform.set(conversation.platform, platformAccounts);
    const branchCount = branchesByConversation.get(conversation.id) || 0;
    const bucket = branchCount >= 4 ? '4+' : String(branchCount || 1);
    branchDistribution.set(bucket, (branchDistribution.get(bucket) || 0) + 1);
  }

  for (const message of filteredMessages) {
    const monthKey = toMonthKey(message.createdAt) || toMonthKey(snapshot.conversations[message.conversationId] ? pickConversationDate(snapshot.conversations[message.conversationId]) : undefined);
    if (monthKey) messageMonthCounts.set(monthKey, (messageMonthCounts.get(monthKey) || 0) + 1);
    imageCounts.set(message.conversationId, (imageCounts.get(message.conversationId) || 0) + (message.hasImages ? 1 : 0));
    if (message.hasCode) codeMessageCount += 1;
    if (message.hasImages) imageMessageCount += 1;
    if (message.hasFiles) fileMessageCount += 1;
    for (const token of tokenize(extractTextFromContentBlocks(message.contentBlocksJson))) {
      wordCounts.set(token, (wordCounts.get(token) || 0) + 1);
    }
  }

  const monthKeys = Array.from(new Set([...messageMonthCounts.keys(), ...conversationMonthCounts.keys()]));
  const monthlyMessageCount = createEmptyMonthSeries(monthKeys, selectedYear).map((entry) => ({ ...entry, value: messageMonthCounts.get(entry.key) || 0 }));
  const monthlyConversationCount = createEmptyMonthSeries(monthKeys, selectedYear).map((entry) => ({ ...entry, value: conversationMonthCounts.get(entry.key) || 0 }));

  const busiestMonth = [...messageMonthCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const mostUsedPlatform = [...platformCounts.entries()].sort((left, right) => right[1] - left[1] || PLATFORM_ORDER.indexOf(left[0]) - PLATFORM_ORDER.indexOf(right[0]))[0]?.[0];

  const platformShare = [...platformCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => ({ key, label: key, value, platform: key, shadeIndex: 0 }));

  const accountShare = [...accountCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([accountId, value]) => {
      const account = snapshot.accounts[accountId];
      const shade = accountShadeIndex(accountId, accountIdsByPlatform);
      return { key: accountId, label: account?.displayLabel || accountId, value, accountId, platform: shade.platform, shadeIndex: shade.shadeIndex };
    });

  const branchCountDistribution = ['1', '2', '3', '4+'].map((key) => ({ key, label: key === '4+' ? '4+ branches' : `${key} branch${key === '1' ? '' : 'es'}`, value: branchDistribution.get(key) || 0 }));
  const wordCloud = [...wordCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 24)
    .map(([term, count], index, items) => ({ term, count, weight: items[0] ? round(count / items[0][1], 2) : 0 }));

  const totalWords = filteredMessages.reduce((sum, message) => sum + (message.wordCount || 0), 0);
  const branchHeavyCount = filteredConversations.filter((conversation) => (branchesByConversation.get(conversation.id) || 0) > 1).length;
  const longestConversation = filteredConversations
    .map((conversation) => ({ conversation, messageCount: messagesByConversation.get(conversation.id) || 0, wordCount: wordsByConversation.get(conversation.id) || 0 }))
    .sort((left, right) => right.messageCount - left.messageCount || String(left.conversation.title).localeCompare(String(right.conversation.title)))[0];
  const highestBranchCount = filteredConversations
    .map((conversation) => ({ conversation, branchCount: branchesByConversation.get(conversation.id) || 0 }))
    .sort((left, right) => right.branchCount - left.branchCount || String(left.conversation.title).localeCompare(String(right.conversation.title)))[0];
  const imageHeaviest = filteredConversations
    .map((conversation) => ({ conversation, imageCount: imageCounts.get(conversation.id) || 0 }))
    .sort((left, right) => right.imageCount - left.imageCount || String(left.conversation.title).localeCompare(String(right.conversation.title)))[0];

  const highlights = [];
  if (longestConversation?.messageCount) highlights.push({ id: 'longest_conversation', label: 'Longest conversation', value: `${longestConversation.conversation.title || '(untitled)'} · ${longestConversation.messageCount} messages`, conversationId: longestConversation.conversation.id, platform: longestConversation.conversation.platform });
  if (highestBranchCount?.branchCount) highlights.push({ id: 'highest_branch_count', label: 'Highest branch count', value: `${highestBranchCount.conversation.title || '(untitled)'} · ${highestBranchCount.branchCount} branches`, conversationId: highestBranchCount.conversation.id, platform: highestBranchCount.conversation.platform });
  if (busiestMonth) highlights.push({ id: 'busiest_month', label: 'Busiest month', value: `${monthLabel(busiestMonth[0])} · ${busiestMonth[1]} messages`, monthKey: busiestMonth[0] });
  if (mostUsedPlatform) highlights.push({ id: 'most_used_platform', label: 'Most used platform', value: `${mostUsedPlatform} · ${platformCounts.get(mostUsedPlatform) || 0} conversations`, platform: mostUsedPlatform });
  if ((imageHeaviest?.imageCount || 0) > 0) highlights.push({ id: 'image_heaviest_chat', label: 'Image-heaviest chat', value: `${imageHeaviest?.conversation.title || '(untitled)'} · ${imageHeaviest?.imageCount} image messages`, conversationId: imageHeaviest?.conversation.id, platform: imageHeaviest?.conversation.platform });

  const topConversations = filteredConversations
    .map((conversation) => ({
      conversationId: conversation.id,
      title: conversation.title || '(untitled)',
      platform: conversation.platform,
      messageCount: messagesByConversation.get(conversation.id) || 0,
      wordCount: wordsByConversation.get(conversation.id) || 0,
      updatedAt: pickConversationDate(conversation)
    }))
    .sort((left, right) => right.messageCount - left.messageCount || String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .slice(0, 5);

  const comparison = selectedYear === 'all'
    ? undefined
    : compareTotals(
        { conversations: filteredConversations.length, messages: filteredMessages.length, words: totalWords },
        availableYears.includes(Number(selectedYear) - 1) ? computeYearTotals(snapshot, Number(selectedYear) - 1) : undefined
      );

  return {
    availableYears,
    selectedYear,
    totals: {
      conversations: filteredConversations.length,
      messages: filteredMessages.length,
      words: totalWords,
      activeMonths: monthKeys.length,
      averageMessagesPerConversation: filteredConversations.length ? round(filteredMessages.length / filteredConversations.length, 1) : 0,
      branchHeavyRatio: filteredConversations.length ? round(branchHeavyCount / filteredConversations.length, 2) : 0
    },
    comparison,
    topTopics: wordCloud.slice(0, 5).map((item) => item.term),
    topConversations,
    modalityCounts: {
      codeMessages: codeMessageCount,
      imageMessages: imageMessageCount,
      fileMessages: fileMessageCount
    },
    longestConversation: longestConversation ? {
      conversationId: longestConversation.conversation.id,
      title: longestConversation.conversation.title || '(untitled)',
      platform: longestConversation.conversation.platform,
      messageCount: longestConversation.messageCount,
      wordCount: longestConversation.wordCount
    } : undefined,
    mostActiveMonth: busiestMonth ? monthLabel(busiestMonth[0]) : undefined,
    mostUsedPlatform,
    monthlyMessageCount,
    monthlyConversationCount,
    platformShare,
    accountShare,
    branchCountDistribution,
    wordCloud,
    highlights
  };
}
