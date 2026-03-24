export function renderWizardExecutionPanel(progress) {
  const percent = Math.round((progress.processed / progress.total) * 100);

  return `<div class="card"><p class="badge">${progress.action}</p><h3>Execution progress</h3><p>Phase: <strong>${progress.phase}</strong></p><p>Processed ${progress.processed} / ${progress.total} · Failed ${progress.failed} · Skipped ${progress.skipped}</p><div style="height: 12px; border-radius: 999px; background: #1e293b; overflow: hidden"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #0ea5e9 0%, #22c55e 100%)"></div></div><p style="margin-top: 12px; color: #cbd5e1">Current item: ${progress.currentItemTitle}</p><button type="button" style="margin-top: 12px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(248,113,113,.45); background: rgba(127,29,29,.35); color: #fecaca">Cancel current run</button></div>`;
}
