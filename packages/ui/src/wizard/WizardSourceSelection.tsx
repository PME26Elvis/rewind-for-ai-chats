import React from 'react';

export function WizardSourceSelection({ selectedCount, selectionLabel }: { selectedCount: number; selectionLabel?: string }) {
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3>Source selection</h3>
      <p>Choose JSON files/folders or browser-saved HTML files/folders for ChatGPT and Gemini.</p>
      <p><strong>{selectedCount}</strong> source{selectedCount === 1 ? '' : 's'} currently selected.</p>
      {selectionLabel ? <p style={{ color: '#cbd5e1' }}>{selectionLabel}</p> : null}
    </div>
  );
}
