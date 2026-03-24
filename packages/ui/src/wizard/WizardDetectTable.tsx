import type { ReviewRow } from '@rewind/core';
import React from 'react';

export function WizardDetectTable({ rows }: { rows: ReviewRow[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Conversation</th>
          <th>Source</th>
          <th>Platform</th>
          <th>Account</th>
          <th>Branch mode</th>
          <th>Confidence</th>
          <th>Warnings</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.platform}-${row.title}-${row.sourceName}`}>
            <td>{row.title}</td>
            <td>{row.sourceKind}</td>
            <td>{row.platform}</td>
            <td>{row.accountLabel}</td>
            <td>{row.branchMode}</td>
            <td>{Math.round(row.confidence * 100)}%</td>
            <td>{row.warnings.length === 0 ? 'None' : row.warnings.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
