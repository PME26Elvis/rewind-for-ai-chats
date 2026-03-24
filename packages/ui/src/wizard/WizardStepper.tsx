import type { WizardStepId } from '@rewind/core';
import React from 'react';

export interface StepDef {
  id: WizardStepId;
  label: string;
}

export function WizardStepper(props: {
  steps: readonly StepDef[];
  activeStepId: WizardStepId;
  completedStepIds: WizardStepId[];
}) {
  return (
    <div className="step-grid" style={{ marginTop: 24 }}>
      {props.steps.map((step, index) => {
        const isComplete = props.completedStepIds.includes(step.id);
        const isActive = props.activeStepId === step.id;
        const className = `step-pill ${isComplete ? 'complete' : ''} ${isActive ? 'active' : ''}`.trim();

        return (
          <div key={step.id} className={className} aria-current={isActive ? 'step' : undefined}>
            <strong>{index + 1}.</strong>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
