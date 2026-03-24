export function renderWizardDetectTable(rows) {
  const body = rows.map((row) => `<tr><td>${row.title}</td><td>${row.sourceKind}</td><td>${row.platform}</td><td>${row.accountLabel}</td><td>${row.branchMode}</td><td>${Math.round(row.confidence * 100)}%</td><td>${row.warnings.length === 0 ? 'None' : row.warnings.join(', ')}</td></tr>`).join('');
  return `<table class="table"><thead><tr><th>Conversation</th><th>Source</th><th>Platform</th><th>Account</th><th>Branch mode</th><th>Confidence</th><th>Warnings</th></tr></thead><tbody>${body}</tbody></table>`;
}
