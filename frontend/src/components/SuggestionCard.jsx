import React from 'react';

const priorityStyles = {
  high: { badge: 'bg-red-500/15 text-red-400 border-red-500/30', icon: '🔴' },
  medium: { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: '🟡' },
  low: { badge: 'bg-accent-500/15 text-accent-400 border-accent-500/30', icon: '🟢' },
};

const categoryIcons = {
  keywords: '🔑',
  skills: '💡',
  experience: '💼',
  format: '📋',
  projects: '🚀',
  education: '🎓',
};

function SuggestionCard({ suggestion, index }) {
  const priority = suggestion.priority || 'medium';
  const category = suggestion.category || 'format';
  const pStyle = priorityStyles[priority] || priorityStyles.medium;

  return (
    <div className="glass-light rounded-xl p-5 hover:border-primary-500/20 transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${pStyle.badge}`}>
            {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-700/60 text-surface-200 border border-surface-700">
            {categoryIcons[category] || '📌'} {category.charAt(0).toUpperCase() + category.slice(1)}
          </span>
        </div>
        <span className="text-surface-700 text-sm font-mono">#{index + 1}</span>
      </div>

      <p className="text-white text-sm leading-relaxed mb-3">
        {suggestion.suggestion}
      </p>

      {suggestion.impact && (
        <div className="bg-primary-500/5 rounded-lg p-3 mb-3 border border-primary-500/10">
          <p className="text-xs text-primary-300 font-medium mb-1">💫 Impact</p>
          <p className="text-xs text-surface-200 leading-relaxed">{suggestion.impact}</p>
        </div>
      )}

      {suggestion.example && (
        <div className="bg-surface-900/50 rounded-lg p-3 border border-surface-700/50">
          <p className="text-xs text-accent-400 font-medium mb-1">📝 Example</p>
          <p className="text-xs text-surface-200 leading-relaxed font-mono whitespace-pre-wrap">{suggestion.example}</p>
        </div>
      )}
    </div>
  );
}

export default SuggestionCard;
