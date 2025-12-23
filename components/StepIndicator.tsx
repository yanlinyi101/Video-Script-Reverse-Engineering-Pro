
import React from 'react';
import { WorkflowStep } from '../types';

interface StepIndicatorProps {
  currentStep: WorkflowStep;
}

const steps = [
  { id: 1, label: '摄取分析' },
  { id: 2, label: '模版提取' },
  { id: 3, label: '选题构思' },
  { id: 4, label: '全篇生成' },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  return (
    <div className="flex items-center justify-between mb-8 w-full max-w-4xl mx-auto px-4">
      {steps.map((step, idx) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center relative group">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2 ${
                currentStep === step.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-110'
                  : currentStep > step.id
                  ? 'bg-blue-100 text-blue-600 border-blue-200'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              {currentStep > step.id ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.id
              )}
            </div>
            <span
              className={`mt-2 text-xs font-medium transition-colors duration-300 ${
                currentStep === step.id ? 'text-blue-700 font-bold' : 'text-slate-500'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className="flex-1 h-0.5 mx-2 mb-6 bg-slate-200 relative overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: currentStep > step.id ? '100%' : '0%' }}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
