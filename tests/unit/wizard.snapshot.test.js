import test from 'node:test';
import assert from 'node:assert/strict';
import { renderApp } from '../../apps/web/src/app/App.js';

test('renders the rewind dashboard shell by default', () => {
  const html = renderApp();

  assert.match(html, /Rewind dashboard/i);
  assert.match(html, /No rewind data yet/i);
  assert.match(html, /Year selector/i);
});
