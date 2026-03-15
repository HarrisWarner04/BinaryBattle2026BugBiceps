import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

function GitHub({ user }) {
  const navigate = useNavigate();
  const [githubToken, setGithubToken] = useState(localStorage.getItem('github_token') || '');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [targetCompany, setTargetCompany] = useState('Google');

  // Check for existing results
  useEffect(() => {
    if (user?.uid) {
      fetchResults();
    }
  }, [user]);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'github-token') {
        const token = event.data.token;
        setGithubToken(token);
        localStorage.setItem('github_token', token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchResults = async () => {
    try {
      const res = await fetch(`${API_URL}/github/results/${user.uid}`);
      const data = await res.json();
      if (data.success && data.data) {
        setResults(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub results:', err);
    }
  };

  const connectGitHub = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/github/auth`);
      const data = await res.json();
      if (data.success) {
        window.open(data.auth_url, 'github-auth', 'width=600,height=700');
      } else {
        setError(data.detail || 'Failed to start GitHub auth');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const syncGitHub = async () => {
    if (!githubToken) {
      setError('Please connect GitHub first');
      return;
    }
    setSyncing(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('uid', user.uid);
      formData.append('github_token', githubToken);
      formData.append('target_company', targetCompany);

      const res = await fetch(`${API_URL}/github/sync`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setResults(data);
      } else {
        setError(data.detail || 'GitHub sync failed');
      }
    } catch (err) {
      setError('GitHub sync request failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleManualToken = () => {
    const token = prompt('Paste your GitHub Personal Access Token (PAT):');
    if (token) {
      setGithubToken(token);
      localStorage.setItem('github_token', token);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Connect Section */}
        {!githubToken && (
          <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-8 text-center space-y-4">
            <div className="text-5xl">🐙</div>
            <h2 className="text-2xl font-bold">Connect Your GitHub</h2>
            <p className="text-surface-400 max-w-lg mx-auto">
              We'll analyze your top repositories, review code quality, and verify your skills.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={connectGitHub}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Connecting...' : '🔗 Connect with GitHub OAuth'}
              </button>
              <button
                onClick={handleManualToken}
                className="px-6 py-3 bg-surface-800 border border-surface-700 rounded-lg hover:bg-surface-700 transition"
              >
                Paste Token Manually
              </button>
            </div>
          </div>
        )}

        {/* Sync Controls */}
        {githubToken && !results && (
          <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Ready to Sync</h2>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm text-surface-400 mb-1">Target Company</label>
                <input
                  type="text"
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="e.g. Google, Microsoft..."
                />
              </div>
              <button
                onClick={syncGitHub}
                disabled={syncing}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
              >
                {syncing ? '🔄 Analyzing Repos...' : '🚀 Sync & Analyze'}
              </button>
            </div>
            {syncing && (
              <div className="flex items-center gap-2 text-surface-400 text-sm">
                <div className="w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                Fetching repos and running AI code review... this may take 30-60 seconds.
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Score Banner */}
            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">GitHub Score</h2>
                <p className="text-surface-400">@{results.login || 'user'} • {results.repos?.length || 0} repos analyzed</p>
              </div>
              <div className="text-5xl font-black text-green-400">
                {results.github_score || 0}<span className="text-2xl text-surface-400">/100</span>
              </div>
            </div>

            {/* Repo Reviews */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold">Repository Reviews</h3>
              {(results.reviews || []).map((review, idx) => (
                <div key={idx} className="bg-surface-900/50 border border-surface-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold">{review.repo_name}</h4>
                      <span className="text-sm text-surface-400">{review.language}</span>
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                      {review.overall_score}/10
                    </div>
                  </div>

                  {/* Score bars */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['code_quality', 'documentation', 'complexity', 'security'].map((key) => (
                      <div key={key} className="space-y-1">
                        <div className="text-xs text-surface-400 capitalize">{key.replace('_', ' ')}</div>
                        <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all"
                            style={{ width: `${(review[key] || 0) * 10}%` }}
                          />
                        </div>
                        <div className="text-xs text-surface-500">{review[key]}/10</div>
                      </div>
                    ))}
                  </div>

                  {/* Strengths */}
                  {review.strengths?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {review.strengths.map((s, i) => (
                        <span key={i} className="px-2 py-1 bg-green-500/10 text-green-400 rounded-md text-xs">{s}</span>
                      ))}
                    </div>
                  )}

                  {/* Issues */}
                  {review.issues?.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-surface-300">Issues Found</div>
                      {review.issues.slice(0, 3).map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            issue.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                            issue.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {issue.severity}
                          </span>
                          <span className="text-surface-300">{issue.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skill level */}
                  <div className="text-sm text-surface-400">
                    Skill Level: <span className="font-semibold text-white capitalize">{review.skill_level}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Skill Verification */}
            {results.skill_verification && (
              <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-5 space-y-3">
                <h3 className="text-xl font-bold">Skill Verification</h3>
                <div className="text-lg">
                  Verification Rate: <span className="font-bold text-green-400">{results.skill_verification.verification_rate}%</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm font-medium text-green-400 mb-2">✅ Verified ({results.skill_verification.verified_skills?.length || 0})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(results.skill_verification.verified_skills || []).map((s, i) => (
                        <span key={i} className="px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-yellow-400 mb-2">⚠️ Unverified ({results.skill_verification.unverified_skills?.length || 0})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(results.skill_verification.unverified_skills || []).map((s, i) => (
                        <span key={i} className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-blue-400 mb-2">🔵 New from Code ({results.skill_verification.new_skills_from_code?.length || 0})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(results.skill_verification.new_skills_from_code || []).map((s, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resync Button */}
            <div className="flex gap-3">
              <button
                onClick={syncGitHub}
                disabled={syncing}
                className="px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg hover:bg-surface-700 transition disabled:opacity-50"
              >
                {syncing ? '🔄 Re-analyzing...' : '🔄 Re-sync Repos'}
              </button>
              <button
                onClick={() => navigate('/upload')}
                className="px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg hover:bg-surface-700 transition"
              >
                ← Back to Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GitHub;
