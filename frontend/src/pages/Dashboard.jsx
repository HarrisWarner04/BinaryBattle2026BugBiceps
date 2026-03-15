import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

function Dashboard({ user }) {
  const navigate = useNavigate();
  const [placescore, setPlacescore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.uid) fetchPlaceScore();
  }, [user]);

  const fetchPlaceScore = async () => {
    try {
      const res = await fetch(`${API_URL}/placescore/${user.uid}`);
      const data = await res.json();
      if (data.success) setPlacescore(data);
    } catch (err) {
      console.error('Failed to fetch PlaceScore:', err);
    } finally {
      setLoading(false);
    }
  };

  const getGrade = (score) => {
    if (score >= 80) return { grade: 'A+', color: 'text-green-400' };
    if (score >= 60) return { grade: 'A', color: 'text-green-400' };
    if (score >= 40) return { grade: 'B', color: 'text-yellow-400' };
    if (score >= 20) return { grade: 'C', color: 'text-orange-400' };
    return { grade: 'D', color: 'text-red-400' };
  };

  const score = placescore?.placescore || 0;
  const { grade, color } = getGrade(score);
  const circumference = 2 * Math.PI * 80;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const segments = [
    {
      name: 'Resume',
      icon: '📄',
      score: placescore?.ats_score || 0,
      weight: '30%',
      contribution: placescore?.breakdown?.resume_contribution || 0,
      route: '/upload',
      color: 'from-blue-500 to-cyan-500',
      desc: 'ATS Score, Semantic Match, Suggestions',
    },
    {
      name: 'GitHub',
      icon: '🐙',
      score: placescore?.github_score || 0,
      weight: '30%',
      contribution: placescore?.breakdown?.github_contribution || 0,
      route: '/github',
      color: 'from-green-500 to-emerald-500',
      desc: 'Code Review, Skill Verification',
    },
    {
      name: 'Interview',
      icon: '🎙️',
      score: placescore?.interview_score || 0,
      weight: '40%',
      contribution: placescore?.breakdown?.interview_contribution || 0,
      route: '/interview',
      color: 'from-purple-500 to-pink-500',
      desc: 'AI Mock Interview, Communication',
    },
  ];

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* PlaceScore Ring */}
            <div className="flex flex-col items-center py-8">
              <div className="relative w-48 h-48">
                <svg className="w-48 h-48 -rotate-90" viewBox="0 0 180 180">
                  <circle cx="90" cy="90" r="80" fill="none" stroke="#1e1e2e" strokeWidth="12" />
                  <circle cx="90" cy="90" r="80" fill="none"
                    stroke="url(#gradient)" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black">{score}</span>
                  <span className="text-sm text-surface-400">/ 100</span>
                  <span className={`text-lg font-bold ${color}`}>{grade}</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold mt-4">Your PlaceScore</h2>
              <p className="text-surface-400 text-sm">
                Complete all 3 segments to get your comprehensive placement readiness score
              </p>
            </div>

            {/* Segment Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {segments.map((seg) => (
                <button key={seg.name} onClick={() => navigate(seg.route)}
                  className="bg-surface-900/50 border border-surface-800 rounded-xl p-6 text-left hover:border-surface-600 transition group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-3xl">{seg.icon}</span>
                    <span className={`text-2xl font-bold bg-gradient-to-r ${seg.color} bg-clip-text text-transparent`}>
                      {seg.score}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold group-hover:text-white transition">{seg.name}</h3>
                  <p className="text-sm text-surface-400 mt-1">{seg.desc}</p>
                  <div className="mt-3 flex justify-between text-xs text-surface-500">
                    <span>Weight: {seg.weight}</span>
                    <span>Contribution: +{seg.contribution}</span>
                  </div>
                  <div className="h-1.5 bg-surface-800 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${seg.color} rounded-full transition-all`}
                      style={{ width: `${seg.score}%` }} />
                  </div>
                </button>
              ))}
            </div>

            {/* Formula */}
            <div className="bg-surface-900/30 border border-surface-800 rounded-xl p-4 text-center">
              <p className="text-sm text-surface-400">
                <b className="text-white">PlaceScore</b> = (Resume × 0.3) + (GitHub × 0.3) + (Interview × 0.4) = <b className="text-yellow-400">{score}</b>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
