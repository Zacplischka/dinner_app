// Progress stepper showing session flow: Lobby → Selecting → Results
// Provides visual wayfinding for multi-step session journey

interface Step {
  id: 'lobby' | 'selecting' | 'results';
  label: string;
}

const STEPS: Step[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'selecting', label: 'Selecting' },
  { id: 'results', label: 'Results' },
];

interface ProgressStepperProps {
  currentStep: 'lobby' | 'selecting' | 'results';
  className?: string;
}

export default function ProgressStepper({ currentStep, className = '' }: ProgressStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                  transition-all duration-300
                  ${isCompleted ? 'bg-success text-midnight shadow-[0_0_8px_rgba(52,211,153,0.4)]' : ''}
                  ${isActive ? 'bg-amber text-midnight shadow-glow' : ''}
                  ${isPending ? 'bg-midnight-200 text-cream-500' : ''}
                `}
                role="listitem"
                aria-current={isActive ? 'step' : undefined}
              >
                {isCompleted ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={`
                  mt-1.5 text-[10px] font-medium transition-colors duration-300
                  ${isCompleted ? 'text-success-light' : ''}
                  ${isActive ? 'text-amber' : ''}
                  ${isPending ? 'text-cream-500/60' : ''}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {index < STEPS.length - 1 && (
              <div
                className={`
                  w-8 h-0.5 mx-2 mb-5 rounded-full transition-colors duration-300
                  ${index < currentIndex ? 'bg-success/50' : 'bg-midnight-200'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
