import type { ImportResultSummary } from '@rewind/core';
import React from 'react';

export function WizardResultSummary({ result }: { result?: ImportResultSummary | null }) {
  if (!result) return null;

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <p className="badge">Result summary</p>
      <h3>Import completed</h3>
      <p>Imported {result.importedCount} · Merged {result.mergedCount} · Skipped {result.skippedCount} · Failed {result.failedCount}</p>
      <p>Parser warnings: {result.parserWarningsCount}</p>
      <p>Library conversations: {result.libraryCount}</p>
    </div>
  );
}
