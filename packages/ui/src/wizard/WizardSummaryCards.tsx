import type { DetectSummary } from '@rewind/core';
import React from 'react';

export function WizardSummaryCards({ summary }: { summary: DetectSummary }) {
  const items = [
    ['Detected', String(summary.totalDetected)],
    ['Estimated size', summary.estimatedSize],
    ['Estimated time', summary.estimatedProcessingTime],
    ['Date span', summary.dateSpan],
    ['Warnings', String(summary.parserWarningsCount)],
    ['Low confidence', String(summary.lowConfidenceCount)]
  ];

  return items.map(([label, value]) => (
    <div className="card" key={label}>
      <p style={{ margin: '0 0 8px', color: '#94a3b8' }}>{label}</p>
      <strong style={{ fontSize: 24 }}>{value}</strong>
    </div>
  ));
}
