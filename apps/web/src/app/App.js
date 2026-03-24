import { getLibraryItems, getRewindAnalytics } from '../lib/browserArchiveStore.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLibraryRows() {
  const items = getLibraryItems();
  if (!items.length) return '<tr><td colspan="6">No imported conversations yet.</td></tr>';
  return items.map((row) => `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.platform)}</td><td>${escapeHtml(row.accountLabel)}</td><td>${escapeHtml(row.updatedAt || 'Unknown')}</td><td>${row.messageCount}</td><td>${row.branchCount}</td></tr>`).join('');
}

export function renderApp() {
  const hash = typeof window === 'undefined' ? '#/rewind' : window.location?.hash || '#/rewind';
  const analytics = getRewindAnalytics('all');
  const libraryRows = renderLibraryRows();

  if (hash.startsWith('#/library')) {
    return `
      <section>
        <h2>Imported conversations</h2>
        <table>
          <thead><tr><th>Title</th><th>Platform</th><th>Account</th><th>Updated</th><th>Messages</th><th>Branches</th></tr></thead>
          <tbody>${libraryRows}</tbody>
        </table>
      </section>
    `;
  }

  if (hash.startsWith('#/wizard')) {
    return '<section><h2>Import Wizard</h2><p>Source</p><p>Detect</p><p>Review</p><p>Result</p></section>';
  }

  const highlights = analytics.highlights.map((item) => `<li>${escapeHtml(item.value)}</li>`).join('');
  return `
    <section>
      <h2>Rewind dashboard</h2>
      ${analytics.totals.conversations === 0 ? '<p>No rewind data yet</p>' : ''}
      <label>Year selector</label>
      <div>Monthly message count</div>
      <div>Platform share</div>
      <div>Word cloud</div>
      <ul>${highlights}</ul>
    </section>
  `;
}
