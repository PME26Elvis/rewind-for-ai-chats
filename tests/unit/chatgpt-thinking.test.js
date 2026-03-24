import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapArchiveDatabase, createArchiveRepository } from '../../packages/db/src/index.js';
import { executeImport } from '../../packages/core/src/index.js';
import { getConversationDetail, setSelectedSources, executeSelectedImport } from '../../apps/web/src/lib/browserArchiveStore.js';

const thinkingFixture = {
  title: 'Reasoning demo',
  conversation_id: 'reasoning-demo',
  create_time: 1710000000,
  update_time: 1710000300,
  current_node: 'answer',
  mapping: {
    root: { id: 'root', parent: null, children: ['user-1'] },
    'user-1': {
      id: 'user-1',
      parent: 'root',
      children: ['thought-1'],
      message: {
        id: 'msg-user-1',
        author: { role: 'user' },
        create_time: 1710000001,
        content: { content_type: 'text', parts: ['How would you solve this?'] },
        metadata: {}
      }
    },
    'thought-1': {
      id: 'thought-1',
      parent: 'user-1',
      children: ['recap-1'],
      message: {
        id: 'msg-thought-1',
        author: { role: 'assistant' },
        create_time: 1710000002,
        content: {
          content_type: 'thoughts',
          thoughts: [
            { summary: 'Plan', content: 'Break the problem into smaller steps.' },
            { content: 'Check assumptions before computing the answer.' }
          ]
        },
        metadata: {}
      }
    },
    'recap-1': {
      id: 'recap-1',
      parent: 'thought-1',
      children: ['answer'],
      message: {
        id: 'msg-recap-1',
        author: { role: 'assistant' },
        create_time: 1710000003,
        content: { content_type: 'reasoning_recap', parts: ['Thought for 7 seconds'] },
        metadata: {}
      }
    },
    answer: {
      id: 'answer',
      parent: 'recap-1',
      children: [],
      message: {
        id: 'msg-answer',
        author: { role: 'assistant' },
        create_time: 1710000004,
        content: { content_type: 'text', parts: ['Start with the known variables, then derive the final equation.'] },
        metadata: { model_slug: 'gpt-4o' }
      }
    }
  }
};

test('chatgpt reasoning nodes are merged into thinking metadata instead of separate chat messages', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);
  const result = executeImport(repository, [{
    sourceName: 'thinking-chatgpt.json',
    sourceKind: 'json',
    content: JSON.stringify(thinkingFixture)
  }]);
  assert.equal(result.failedCount, 0);

  const rows = db.prepare('SELECT role, source_metadata_json AS sourceMetadataJson, content_blocks_json AS contentBlocksJson FROM messages ORDER BY created_at').all();
  assert.equal(rows.length, 2);
  const assistantRow = rows.find((row) => row.role === 'assistant');
  const meta = JSON.parse(assistantRow.sourceMetadataJson);
  assert.match(meta.thinking, /Thought for 7 seconds/);
  assert.match(meta.thinking, /Break the problem into smaller steps/);
  assert.doesNotMatch(assistantRow.contentBlocksJson, /Thought for 7 seconds/);
});

test('selected sources keep full content in memory but only store lightweight metadata in localStorage', () => {
  const store = new Map();
  global.window = {
    location: { hash: '#/import' },
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, value); },
      removeItem(key) { store.delete(key); }
    },
    dispatchEvent() {}
  };

  const sources = [{ sourceName: 'thinking-chatgpt.json', sourceKind: 'json', content: JSON.stringify(thinkingFixture) }];
  setSelectedSources(sources);
  const persisted = JSON.parse(store.get('rewind:selected-import-sources'));
  assert.deepEqual(persisted, [{ sourceName: 'thinking-chatgpt.json', sourceKind: 'json' }]);

  const result = executeSelectedImport();
  assert.equal(result.resultSummary.failedCount, 0);
  const archive = JSON.parse(store.get('rewind:browser-archive'));
  assert.equal(Object.keys(archive.conversations).length, 1);
});
