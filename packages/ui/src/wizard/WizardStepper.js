export function renderWizardStepper({ steps, activeStepId, completedStepIds }) {
  const items = steps.map((step, index) => {
    const isComplete = completedStepIds.includes(step.id);
    const isActive = activeStepId === step.id;
    const className = ['step-pill', isComplete ? 'complete' : '', isActive ? 'active' : ''].filter(Boolean).join(' ');
    const ariaCurrent = isActive ? ' aria-current="step"' : '';
    return `<div class="${className}"${ariaCurrent}><strong>${index + 1}.</strong><span>${step.label}</span></div>`;
  });

  return `<div class="step-grid" style="margin-top: 24px">${items.join('')}</div>`;
}
