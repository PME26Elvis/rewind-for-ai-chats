import { detectImportSources, executeImport } from './pipeline.js';

export const WIZARD_STEPS = [
  { id: 'source', label: 'Source' },
  { id: 'detect', label: 'Detect' },
  { id: 'review', label: 'Review' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'execute', label: 'Execute' },
  { id: 'result', label: 'Result' }
];

function summarizeSelection(files) {
  const kindLabels = Array.from(new Set(files.map((file) => file.sourceKind || (file.sourceName.endsWith('.html') ? 'html' : 'json'))));
  if (files.length === 0) return 'No JSON or HTML source selected yet.';
  return `${files.length} source${files.length === 1 ? '' : 's'} selected (${kindLabels.join(' + ').toUpperCase()})`;
}

export function createWizardSnapshot(files = [], preparedImports) {
  const detection = detectImportSources(files, preparedImports);
  return {
    activeStepId: files.length === 0 ? 'source' : 'review',
    completedStepIds: files.length === 0 ? [] : ['source', 'detect'],
    sourceSelectionLabel: summarizeSelection(files),
    detectSummary: detection.summary,
    reviewRows: detection.reviewRows,
    executionProgress: {
      action: 'import',
      phase: files.length === 0 ? 'reading' : 'writing',
      processed: detection.reviewRows.length,
      total: Math.max(1, detection.reviewRows.length),
      failed: 0,
      skipped: 0,
      currentItemTitle: detection.reviewRows.at(-1)?.title || 'Awaiting selection'
    }
  };
}

export function runImportWizard(repository, files) {
  const before = createWizardSnapshot(files);
  const resultSummary = executeImport(repository, files);
  return {
    ...before,
    activeStepId: 'result',
    completedStepIds: WIZARD_STEPS.map((step) => step.id),
    executionProgress: {
      action: 'import',
      phase: 'writing',
      processed: files.length,
      total: Math.max(1, files.length),
      failed: resultSummary.failedCount,
      skipped: resultSummary.skippedCount,
      currentItemTitle: before.reviewRows.at(-1)?.title || 'Completed'
    },
    resultSummary
  };
}

export const runJsonImportWizard = runImportWizard;
