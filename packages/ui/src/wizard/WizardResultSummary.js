export function renderWizardResultSummary(result) {
  if (!result) return '';
  return `<div class="card" style="margin-top: 24px"><p class="badge">Result summary</p><h3>Import completed</h3><p>Imported ${result.importedCount} · Merged ${result.mergedCount} · Skipped ${result.skippedCount} · Failed ${result.failedCount}</p><p>Parser warnings: ${result.parserWarningsCount}</p><p>Library conversations: ${result.libraryCount}</p></div>`;
}
