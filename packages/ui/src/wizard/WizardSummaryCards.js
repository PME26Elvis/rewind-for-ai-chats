export function renderWizardSummaryCards(summary) {
  const items = [
    ['Detected', String(summary.totalDetected)],
    ['Estimated size', summary.estimatedSize],
    ['Estimated time', summary.estimatedProcessingTime],
    ['Date span', summary.dateSpan],
    ['Warnings', String(summary.parserWarningsCount)],
    ['Low confidence', String(summary.lowConfidenceCount)]
  ];

  return items.map(([label, value]) => `<div class="card"><p style="margin: 0 0 8px; color: #94a3b8">${label}</p><strong style="font-size: 24px">${value}</strong></div>`).join('');
}
