import React, { useEffect, useState } from 'react';

function SemanticMatchBar({ percentage, cosineValue }) {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedWidth(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  const getLabel = (p) => {
    if (p >= 80) return 'Excellent';
    if (p >= 65) return 'Good';
    if (p >= 45) return 'Moderate';
    return 'Low';
  };

  const getColor = (p) => {
    if (p >= 80) return { bar: 'bg-accent-500', text: 'text-accent-400' };
    if (p >= 65) return { bar: 'bg-primary-500', text: 'text-primary-400' };
    if (p >= 45) return { bar: 'bg-amber-500', text: 'text-amber-400' };
    return { bar: 'bg-red-500', text: 'text-red-400' };
  };

  const label = getLabel(percentage);
  const colors = getColor(percentage);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">{percentage}%</span>
          <span className={`text-sm font-medium ${colors.text}`}>{label}</span>
        </div>
        {cosineValue !== undefined && (
          <span className="text-xs text-surface-200">
            Cosine similarity: {cosineValue}
          </span>
        )}
      </div>
      <div className="w-full h-3 bg-surface-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colors.bar} transition-all duration-1000 ease-out`}
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
    </div>
  );
}

export default SemanticMatchBar;
