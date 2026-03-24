import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapArchiveDatabase, createArchiveRepository } from '../../packages/db/src/index.js';
import { detectImportSources, executeImport } from '../../packages/core/src/index.js';
import { executeSelectedImport, getConversationDetail, readBrowserArchive, setSelectedSources } from '../../apps/web/src/lib/browserArchiveStore.js';

const fixtureDir = join(process.cwd(), 'tests/fixtures/import/realworld');
const files = readdirSync(fixtureDir).map((name) => ({
  sourceName: name,
  sourceKind: /\.(html?|mhtml|mht)$/i.test(name) ? 'html' : 'json',
  content: readFileSync(join(fixtureDir, name), 'utf8')
}));

function createLocalStorage() {
  const store = new Map();
  let writes = 0;
  return {
    store,
    get writes() { return writes; },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { writes += 1; store.set(key, value); },
    removeItem(key) { store.delete(key); }
  };
}

test('real-world fixtures detect every supported platform and keep chatgpt mhtml visible', () => {
  const detection = detectImportSources(files);
  const byName = Object.fromEntries(detection.reviewRows.map((row) => [row.sourceName, row]));

  assert.equal(detection.summary.totalDetected, 6);
  assert.equal(byName['chatgpt_#U958b#U6e90#U5de5#U5177#U532f#U51fa#U804a#U5929#U7d00#U9304.mhtml'].platform, 'chatgpt');
  assert.ok(byName['chatgpt_#U958b#U6e90#U5de5#U5177#U532f#U51fa#U804a#U5929#U7d00#U9304.mhtml'].messageCount > 10);
  assert.equal(byName['grok_GitHub Classroom #U4f5c#U696d#U7e73#U4ea4#U6d41#U7a0b.mhtml'].platform, 'grok');
  assert.equal(byName['gemini_Building-a-modern-data-centre.mhtml'].platform, 'gemini');
  assert.equal(byName['claude_Building a search engine_ costs and location.mhtml'].platform, 'claude');
});

test('real-world fixtures import without failures into the sqlite repository', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);
  const result = executeImport(repository, files);
  assert.equal(result.failedCount, 0);
  assert.equal(result.importedCount, 6);

  const conversations = db.prepare('SELECT platform, title FROM conversations ORDER BY platform, title').all();
  assert.ok(conversations.some((row) => row.platform === 'chatgpt' && /開源工具匯出聊天紀錄/.test(row.title)));
  assert.ok(conversations.some((row) => row.platform === 'grok'));
  assert.ok(conversations.some((row) => row.platform === 'gemini'));
  assert.ok(conversations.some((row) => row.platform === 'claude'));
});

test('browser import persists once per import instead of once per message', () => {
  const localStorage = createLocalStorage();
  global.window = {
    location: { hash: '#/import' },
    localStorage,
    dispatchEvent() {}
  };

  setSelectedSources(files);
  const result = executeSelectedImport();
  assert.equal(result.resultSummary.failedCount, 0);
  assert.ok(localStorage.writes <= 6, `expected a handful of localStorage writes, got ${localStorage.writes}`);

  const archive = readBrowserArchive();
  assert.equal(Object.keys(archive.conversations).length, 6);

  const chatgptConversationId = Object.values(archive.conversations).find((conversation) => conversation.platform === 'chatgpt' && /開源工具匯出聊天紀錄/.test(conversation.title))?.id;
  assert.ok(chatgptConversationId);
  const detail = getConversationDetail(chatgptConversationId);
  assert.ok(detail.messages.length > 10);
  assert.match(detail.messages[0].text, /開源|Export|Gemini/i);
});
