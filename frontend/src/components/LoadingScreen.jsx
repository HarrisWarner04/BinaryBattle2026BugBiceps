import React from 'react';

function LoadingScreen({ steps, currentStep }) {
  return (
    <div className="fixed inset-0 z-50 bg-surface-950/90 backdrop-blur-sm flex items-center justify-center">
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/20 mb-4">
            <div className="w-8 h-8 border-3 border-primary-400/30 border-t-primary-400 rounded-full animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Analysing Your Resume</h2>
          <p className="text-sm text-surface-200">This may take a minute...</p>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const isComplete = index < currentStep;
            const isActive = index === currentStep;
            const isPending = index > currentStep;

            return (
              <div
                key={index}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${
                  isActive
                    ? 'bg-primary-500/10 border border-primary-500/30'
                    : isComplete
                    ? 'bg-accent-500/5'
                    : 'opacity-40'
                }`}
              >
                <div className="flex-shrink-0">
                  {isComplete ? (
                    <div className="w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center animate-fade-in">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div className="w-6 h-6 rounded-full border-2 border-primary-400 border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-surface-700" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-primary-300' : isComplete ? 'text-accent-400' : 'text-surface-700'
                  }`}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
