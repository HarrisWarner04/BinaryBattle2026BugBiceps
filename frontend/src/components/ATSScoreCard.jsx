import React, { useEffect, useRef, useState } from 'react';

function ATSScoreCard({ score, size = 'large', grade }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const circleRef = useRef(null);

  const isLarge = size === 'large';
  const diameter = isLarge ? 160 : 60;
  const strokeWidth = isLarge ? 10 : 6;
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const getColor = (s) => {
    if (s >= 80) return { stroke: '#22c55e', bg: 'rgba(34,197,94,0.1)', text: 'text-accent-400' };
    if (s >= 60) return { stroke: '#f59e0b', bg: 'rgba(245,158,11,0.1)', text: 'text-amber-400' };
    return { stroke: '#ef4444', bg: 'rgba(239,68,68,0.1)', text: 'text-red-400' };
  };

  const colors = getColor(score);
  const dashOffset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    const duration = 1500;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setAnimatedScore(Math.round(eased * score));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: diameter, height: diameter }}>
        <svg
          width={diameter}
          height={diameter}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke="rgba(100,116,139,0.15)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            ref={circleRef}
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${colors.text} ${isLarge ? 'text-3xl' : 'text-lg'}`}>
            {animatedScore}
          </span>
          {isLarge && grade && (
            <span className={`text-sm font-semibold ${colors.text} mt-0.5`}>
              {grade}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ATSScoreCard;
