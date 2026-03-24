import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeRewindAnalytics } from '../../packages/core/src/index.js';
import { renderApp } from '../../apps/web/src/app/App.js';

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/rewind/dashboard-archive.json'), 'utf8'));

function createLocalStorage() {
  return {
    store: new Map(),
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
    setItem(key, value) { this.store.set(key, value); },
    removeItem(key) { this.store.delete(key); }
  };
}

test('analytics aggregation computes top-level rewind stats', () => {
  const analytics = computeRewindAnalytics(fixture, 'all');

  assert.equal(analytics.totals.conversations, 5);
  assert.equal(analytics.totals.messages, 13);
  assert.equal(analytics.totals.words, 81);
  assert.equal(analytics.totals.activeMonths, 5);
  assert.equal(analytics.totals.averageMessagesPerConversation, 2.6);
  assert.equal(analytics.mostActiveMonth, 'Jan 2025');
  assert.equal(analytics.mostUsedPlatform, 'chatgpt');
  assert.equal(analytics.totals.branchHeavyRatio, 0.6);
  assert.equal(analytics.platformShare[0].label, 'chatgpt');
  assert.equal(analytics.accountShare[0].label, 'ChatGPT Personal');
  assert.equal(analytics.branchCountDistribution.find((entry) => entry.key === '2').value, 2);
  assert.equal(analytics.wordCloud[0].term, 'roadmap');
});

test('yearly filtering returns only the selected year and pads monthly charts', () => {
  const analytics = computeRewindAnalytics(fixture, 2025);

  assert.equal(analytics.totals.conversations, 3);
  assert.equal(analytics.totals.messages, 7);
  assert.equal(analytics.totals.activeMonths, 3);
  assert.equal(analytics.monthlyMessageCount.length, 12);
  assert.equal(analytics.monthlyMessageCount.find((entry) => entry.key === '2025-01').value, 4);
  assert.equal(analytics.monthlyConversationCount.find((entry) => entry.key === '2025-02').value, 1);
  assert.equal(analytics.monthlyConversationCount.find((entry) => entry.key === '2025-04').value, 0);
});

test('highlight generation omits image-heavy highlight when no images exist in the selected year', () => {
  const allTime = computeRewindAnalytics(fixture, 'all');
  const yearly = computeRewindAnalytics(fixture, 2025);

  assert.ok(allTime.highlights.some((item) => item.id === 'image_heaviest_chat'));
  assert.ok(yearly.highlights.every((item) => item.id !== 'image_heaviest_chat'));
  assert.match(yearly.highlights.find((item) => item.id === 'longest_conversation').value, /Research backlog/);
  assert.match(allTime.highlights.find((item) => item.id === 'highest_branch_count').value, /Image sprint review/);
});

test('dashboard rendering shows rewind charts and imported data', () => {
  global.window = { location: { hash: '#/rewind' }, localStorage: createLocalStorage() };
  window.localStorage.setItem('rewind:browser-archive', JSON.stringify(fixture));

  const app = renderApp();
  assert.match(app, /Rewind dashboard/);
  assert.match(app, /Monthly message count/);
  assert.match(app, /Platform share/);
  assert.match(app, /Word cloud/);
  assert.match(app, /Research backlog/);
  assert.match(app, /Image sprint review/);
});
