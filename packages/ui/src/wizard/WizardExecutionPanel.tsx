import type { ExecutionProgress } from '@rewind/core';
import React from 'react';

export function WizardExecutionPanel({ progress }: { progress: ExecutionProgress }) {
  const percent = Math.round((progress.processed / progress.total) * 100);

  return (
    <div className="card">
      <p className="badge">{progress.action}</p>
      <h3>Execution progress</h3>
      <p>
        Phase: <strong>{progress.phase}</strong>
      </p>
      <p>
        Processed {progress.processed} / {progress.total} · Failed {progress.failed} · Skipped {progress.skipped}
      </p>
      <div style={{ height: 12, borderRadius: 999, background: '#1e293b', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'linear-gradient(90deg, #0ea5e9 0%, #22c55e 100%)' }} />
      </div>
      <p style={{ marginTop: 12, color: '#cbd5e1' }}>Current item: {progress.currentItemTitle}</p>
      <button type="button" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(248,113,113,.45)', background: 'rgba(127,29,29,.35)', color: '#fecaca' }}>
        Cancel current run
      </button>
    </div>
  );
}
