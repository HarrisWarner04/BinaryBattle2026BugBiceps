import React from 'react';

const typeStyles = {
  verified: 'bg-accent-500/15 text-accent-400 border border-accent-500/30',
  missing: 'bg-red-500/15 text-red-400 border border-red-500/30',
  bonus: 'bg-primary-500/15 text-primary-400 border border-primary-500/30',
  neutral: 'bg-surface-700/50 text-surface-200 border border-surface-700',
};

function SkillBadge({ skill, type = 'neutral' }) {
  const style = typeStyles[type] || typeStyles.neutral;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${style} transition-transform duration-200 hover:scale-105`}
    >
      {type === 'verified' && (
        <svg className="w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {type === 'missing' && (
        <svg className="w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {type === 'bonus' && (
        <svg className="w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      )}
      {skill}
    </span>
  );
}

export default SkillBadge;
