import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

function Leaderboard({ user }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // JD Match state
  const [showJdModal, setShowJdModal] = useState(false);
  const [jdText, setJdText] = useState('');
  const [jdActive, setJdActive] = useState(false);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async (company = '') => {
    setLoading(true);
    try {
      const query = company ? `?company=${encodeURIComponent(company)}` : '';
      const res = await fetch(`${API_URL}/leaderboard${query}`);
      const data = await res.json();
      if (data.success) {
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCompanyFilter(searchInput);
    fetchLeaderboard(searchInput);
  };

  const clearFilter = () => {
    setSearchInput('');
    setCompanyFilter('');
    fetchLeaderboard();
  };

  // JD Match
  const submitJdMatch = async () => {
    if (!jdText.trim() || jdText.trim().length < 20) {
      setJdError('Please paste a job description (at least 20 characters).');
      return;
    }
    setJdError('');
    setJdLoading(true);
    try {
      const res = await fetch(`${API_URL}/leaderboard/match-jd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description: jdText }),
      });
      const data = await res.json();
      if (data.success) {
        setCandidates(data.candidates || []);
        setJdActive(true);
        setShowJdModal(false);
      } else {
        setJdError(data.detail || 'Match failed');
      }
    } catch (err) {
      setJdError('Failed to match JD: ' + err.message);
    } finally {
      setJdLoading(false);
    }
  };

  const clearJdMatch = () => {
    setJdActive(false);
    setJdText('');
    fetchLeaderboard();
  };

  const getGradeColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-emerald-400';
    if (score >= 40) return 'text-yellow-400';
    if (score >= 20) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
            🏆 PlaceScore Leaderboard
          </h1>
          <p className="text-surface-400">
            Top candidates ranked by PlaceScore — for recruiters & companies
          </p>
        </div>

        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto items-center">
          {/* Company Filter */}
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 w-full">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by company..."
              className="flex-1 px-4 py-2.5 bg-surface-900 border border-surface-700 rounded-lg text-white placeholder-surface-500 focus:border-yellow-500/50 focus:outline-none transition text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-semibold hover:opacity-90 transition text-black text-sm"
            >
              Search
            </button>
            {companyFilter && (
              <button
                type="button"
                onClick={clearFilter}
                className="px-3 py-2.5 bg-surface-800 border border-surface-700 rounded-lg hover:bg-surface-700 transition text-sm"
              >
                ✕
              </button>
            )}
          </form>

          {/* JD Match Button */}
          {!jdActive ? (
            <button
              onClick={() => setShowJdModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-semibold hover:opacity-90 transition text-white text-sm whitespace-nowrap flex items-center gap-1.5"
            >
              🔍 Match JD
            </button>
          ) : (
            <button
              onClick={clearJdMatch}
              className="px-4 py-2.5 bg-purple-500/20 border border-purple-500/40 rounded-lg font-semibold hover:bg-purple-500/30 transition text-purple-300 text-sm whitespace-nowrap flex items-center gap-1.5"
            >
              ✕ Clear JD Match
            </button>
          )}
        </div>

        {/* Active JD Badge */}
        {jdActive && (
          <div className="text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-full text-sm text-purple-300">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              Company Mode — showing candidates ranked by JD match + PlaceScore
            </span>
          </div>
        )}

        {companyFilter && !jdActive && (
          <div className="text-center text-sm text-surface-400">
            Showing candidates targeting: <span className="text-yellow-400 font-semibold">{companyFilter}</span>
          </div>
        )}

        {/* Leaderboard Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="text-5xl">📊</div>
            <h2 className="text-xl font-semibold">No candidates yet</h2>
            <p className="text-surface-400">
              {companyFilter
                ? `No candidates found targeting "${companyFilter}". Try a different company.`
                : 'Candidates will appear here after completing their assessments.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface-900/50 border border-surface-800 rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className={`grid ${jdActive ? 'grid-cols-14' : 'grid-cols-12'} gap-2 px-4 py-3 bg-surface-900 border-b border-surface-800 text-xs font-semibold text-surface-400 uppercase tracking-wider`}>
              <div className="col-span-1 text-center">Rank</div>
              <div className={jdActive ? 'col-span-3' : 'col-span-3'}>Candidate</div>
              <div className="col-span-2">Target Company</div>
              <div className="col-span-1 text-center">Resume</div>
              <div className="col-span-1 text-center">GitHub</div>
              <div className="col-span-1 text-center">Interview</div>
              {jdActive && <div className="col-span-2 text-center">JD Match</div>}
              <div className={`${jdActive ? 'col-span-3' : 'col-span-3'} text-center`}>
                {jdActive ? 'Blended' : 'PlaceScore'}
              </div>
            </div>

            {/* Table Rows */}
            {candidates.map((c) => (
              <div
                key={c.uid}
                className={`grid ${jdActive ? 'grid-cols-14' : 'grid-cols-12'} gap-2 px-4 py-3 items-center border-b border-surface-800/50 hover:bg-surface-800/30 transition ${
                  c.rank <= 3 ? 'bg-yellow-500/5' : ''
                } ${user && c.uid === user.uid ? 'bg-primary-500/10 border-l-2 border-l-primary-500' : ''}`}
              >
                <div className="col-span-1 text-center text-lg font-bold">
                  {getRankBadge(c.rank)}
                </div>
                <div className={jdActive ? 'col-span-3' : 'col-span-3'}>
                  <div className="font-semibold text-sm truncate">{c.name || 'Anonymous'}</div>
                  <div className="text-xs text-surface-500 truncate">{c.email}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-surface-300 truncate block">{c.target_company || '—'}</span>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-sm font-medium text-blue-400">{c.ats_score || 0}</span>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-sm font-medium text-green-400">{c.github_score || 0}</span>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-sm font-medium text-purple-400">{c.interview_score || 0}</span>
                </div>
                {jdActive && (
                  <div className="col-span-2 flex items-center justify-center gap-1.5">
                    <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full transition-all"
                        style={{ width: `${c.jd_match_score || 0}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold ${getGradeColor(c.jd_match_score || 0)}`}>
                      {c.jd_match_score || 0}
                    </span>
                  </div>
                )}
                <div className={`${jdActive ? 'col-span-3' : 'col-span-3'} flex items-center justify-center gap-2`}>
                  <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden max-w-[120px]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        jdActive
                          ? 'bg-gradient-to-r from-purple-500 to-yellow-500'
                          : 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      }`}
                      style={{ width: `${jdActive ? (c.blended_score || 0) : c.placescore}%` }}
                    />
                  </div>
                  <span className={`text-lg font-black min-w-[3rem] text-right ${getGradeColor(jdActive ? (c.blended_score || 0) : c.placescore)}`}>
                    {jdActive ? (c.blended_score || 0) : c.placescore}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {!loading && candidates.length > 0 && (
          <div className="flex justify-center gap-6 text-sm text-surface-400">
            <span>{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>
              Avg {jdActive ? 'Blended' : 'PlaceScore'}:{' '}
              {(
                candidates.reduce((a, c) => a + (jdActive ? (c.blended_score || 0) : c.placescore), 0) /
                candidates.length
              ).toFixed(1)}
            </span>
            <span>•</span>
            <span>Top: {jdActive ? (candidates[0]?.blended_score || 0) : (candidates[0]?.placescore || 0)}</span>
          </div>
        )}
      </div>

      {/* JD Modal */}
      {showJdModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">🔍 Match Job Description</h2>
                <p className="text-sm text-surface-400 mt-1">
                  Paste your JD and we'll rank candidates by semantic match
                </p>
              </div>
              <button
                onClick={() => { setShowJdModal(false); setJdError(''); }}
                className="text-surface-500 hover:text-white transition text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full Job Description here...&#10;&#10;Example: We are looking for a Software Engineer with experience in React, Node.js, and cloud infrastructure..."
              className="w-full h-48 px-4 py-3 bg-surface-800 border border-surface-700 rounded-xl text-white placeholder-surface-500 focus:border-purple-500/50 focus:outline-none transition resize-none text-sm leading-relaxed"
            />

            {jdError && (
              <p className="text-red-400 text-sm">⚠️ {jdError}</p>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-surface-500">
                {jdText.length} characters
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowJdModal(false); setJdError(''); }}
                  className="px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm hover:bg-surface-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={submitJdMatch}
                  disabled={jdLoading}
                  className="px-5 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-semibold text-white text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {jdLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Matching...
                    </>
                  ) : (
                    '🚀 Find Matching Candidates'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
