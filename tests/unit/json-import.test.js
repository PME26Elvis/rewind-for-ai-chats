import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapArchiveDatabase, createArchiveRepository } from '../../packages/db/src/index.js';
import { detectImportSources, executeImport, runImportWizard } from '../../packages/core/src/index.js';
import { renderApp } from '../../apps/web/src/app/App.js';

const fixtureDir = join(process.cwd(), 'tests/fixtures/import');
const jsonFiles = [
  { sourceName: 'chatgpt-conversation.json', sourceKind: 'json', content: readFileSync(join(fixtureDir, 'chatgpt-conversation.json'), 'utf8') },
  { sourceName: 'gemini-conversation.json', sourceKind: 'json', content: readFileSync(join(fixtureDir, 'gemini-conversation.json'), 'utf8') }
];
const htmlFiles = [
  { sourceName: 'chatgpt-conversation.html', sourceKind: 'html', content: readFileSync(join(fixtureDir, 'chatgpt-conversation.html'), 'utf8') },
  { sourceName: 'gemini-conversation.html', sourceKind: 'html', content: readFileSync(join(fixtureDir, 'gemini-conversation.html'), 'utf8') }
];
const warningHtml = { sourceName: 'chatgpt-warning.html', sourceKind: 'html', content: readFileSync(join(fixtureDir, 'chatgpt-warning.html'), 'utf8') };

test('JSON import succeeds for ChatGPT and Gemini fixtures', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);
  const detection = detectImportSources(jsonFiles);
  assert.equal(detection.summary.totalDetected, 2);
  assert.equal(detection.reviewRows[0].platform, 'chatgpt');
  assert.equal(detection.reviewRows[1].platform, 'gemini');

  const result = executeImport(repository, jsonFiles);
  assert.equal(result.importedCount, 2);
  assert.equal(result.failedCount, 0);

  const counts = {
    accounts: db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count,
    conversations: db.prepare('SELECT COUNT(*) AS count FROM conversations').get().count,
    branches: db.prepare('SELECT COUNT(*) AS count FROM branches').get().count,
    messages: db.prepare('SELECT COUNT(*) AS count FROM messages').get().count,
    importJobs: db.prepare('SELECT COUNT(*) AS count FROM import_jobs').get().count
  };

  assert.deepEqual(counts, { accounts: 2, conversations: 2, branches: 2, messages: 5, importJobs: 1 });
});

test('HTML import succeeds for ChatGPT fixture and preserves raw HTML path', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);
  const detection = detectImportSources([htmlFiles[0]]);

  assert.equal(detection.reviewRows[0].platform, 'chatgpt');
  assert.equal(detection.reviewRows[0].sourceKind, 'html');
  assert.ok(detection.reviewRows[0].warnings.includes('unsupported_block_type'));

  const result = executeImport(repository, [htmlFiles[0]]);
  assert.equal(result.importedCount, 1);
  assert.equal(result.parserWarningsCount, 2);

  const conversation = db.prepare('SELECT source_type AS sourceType, raw_html_path AS rawHtmlPath, parse_confidence AS parseConfidence FROM conversations').get();
  assert.equal(conversation.sourceType, 'html_import');
  assert.equal(conversation.rawHtmlPath, 'chatgpt-conversation.html');
  assert.ok(conversation.parseConfidence < 1 && conversation.parseConfidence > 0.5);
});

test('HTML import succeeds for Gemini fixture', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);
  const result = executeImport(repository, [htmlFiles[1]]);

  assert.equal(result.importedCount, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages').get().count, 2);
  assert.equal(db.prepare('SELECT platform FROM conversations').get().platform, 'gemini');
});

test('parser confidence and warning reporting surfaces HTML warnings', () => {
  const detection = detectImportSources([warningHtml]);
  assert.equal(detection.summary.totalDetected, 1);
  assert.equal(detection.summary.lowConfidenceCount, 1);
  assert.ok(detection.summary.parserWarningsCount >= 3);
  assert.ok(detection.reviewRows[0].warnings.includes('role_guess_used'));
  assert.ok(detection.reviewRows[0].warnings.includes('timestamp_partial'));
});

test('HTML import is idempotent and prevents duplicates', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);

  const first = executeImport(repository, htmlFiles);
  const second = executeImport(repository, htmlFiles);

  assert.equal(first.importedCount, 2);
  assert.equal(second.importedCount, 0);
  assert.equal(second.mergedCount, 2);
  assert.equal(second.skippedCount, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM conversations').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages').get().count, 4);
});

test('wizard execution returns a result summary for HTML imports', () => {
  const db = bootstrapArchiveDatabase();
  const repository = createArchiveRepository(db);
  const snapshot = runImportWizard(repository, htmlFiles);

  assert.equal(snapshot.activeStepId, 'result');
  assert.equal(snapshot.resultSummary.importedCount, 2);
  assert.equal(snapshot.detectSummary.totalDetected, 2);
  assert.match(JSON.stringify(snapshot.completedStepIds), /result/);
});

test('library rendering shows imported HTML and JSON conversations from storage', async () => {
  global.window = {
    location: { hash: '#/library' },
    localStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
      setItem(key, value) { this.store.set(key, value); },
      removeItem(key) { this.store.delete(key); }
    }
  };

  window.localStorage.setItem('rewind:selected-import-sources', JSON.stringify([...jsonFiles, ...htmlFiles]));
  const appBefore = renderApp();
  assert.match(appBefore, /No imported conversations yet/i);

  const { executeImportAndPersist } = await import('../../apps/web/src/pages/wizard/WizardPage.js');
  executeImportAndPersist();
  const appAfter = renderApp();

  assert.match(appAfter, /Roadtrip planning/);
  assert.match(appAfter, /Gemini research notes/);
  assert.match(appAfter, /Roadtrip planning HTML/);
  assert.match(appAfter, /Gemini research notes HTML/);
  assert.match(appAfter, /Personal HTML/);
  assert.match(appAfter, /Research HTML/);
});
