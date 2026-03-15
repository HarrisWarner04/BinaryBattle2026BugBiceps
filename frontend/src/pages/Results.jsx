import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import ATSScoreCard from '../components/ATSScoreCard';
import SemanticMatchBar from '../components/SemanticMatchBar';
import SkillBadge from '../components/SkillBadge';
import SuggestionCard from '../components/SuggestionCard';
import LaTeXPreview from '../components/LaTeXPreview';
import { API_URL } from '../config';

function Results({ user }) {
  const { resumeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [expandedScores, setExpandedScores] = useState({});

  useEffect(() => {
    // If we navigated here with analysisData in state (fresh analysis), use it
    if (location.state?.analysisData && location.state.analysisData.resume_id === resumeId) {
      setData(location.state.analysisData);
      setLoading(false);
    } else {
      // Otherwise fetch from API
      fetchResume();
    }
    fetchHistory();
  }, [resumeId]);

  const fetchResume = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/resume/${user.uid}/${resumeId}`);
      if (!res.ok) throw new Error('Failed to load resume analysis');
      const result = await res.json();
      setData(result.data || result);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/resume-history/${user.uid}`);
      if (res.ok) {
        const result = await res.json();
        setHistory(result.resumes || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  // Fetch job recommendations when data is ready
  useEffect(() => {
    if (data && data.parsed_data && !recommendations) {
      fetchRecommendations();
    }
  }, [data]);

  const fetchRecommendations = async () => {
    setRecsLoading(true);
    try {
      const res = await fetch(`${API_URL}/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_data: data.parsed_data,
          ats_score: data.ats_score || {},
        }),
      });
      const result = await res.json();
      if (result.success) setRecommendations(result);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setRecsLoading(false);
    }
  };

  const targetCompany = (companyName) => {
    const existing = JSON.parse(localStorage.getItem('hr_targetCompanies') || '[]');
    if (!existing.includes(companyName)) existing.push(companyName);
    localStorage.setItem('hr_targetCompanies', JSON.stringify(existing));
    alert(`✅ ${companyName} added to your target companies! It will be pre-filled in Interview setup.`);
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-surface-200 text-sm">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-2">Error Loading Analysis</p>
          <p className="text-surface-200 text-sm mb-4">{error}</p>
          <button
            onClick={() => navigate('/upload')}
            className="px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
          >
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const atsScore = data.ats_score || {};
  const semanticMatch = data.semantic_match || {};
  const suggestions = data.suggestions || [];
  const subScores = atsScore.sub_scores || {};
  const skillGap = semanticMatch.skill_gap_analysis || {};

  return (
    <div className="min-h-screen bg-surface-950">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex gap-8">
        {/* Main Content */}
        <div className="flex-1 space-y-8">
          {/* Section 1: Score Overview */}
          <section className="glass rounded-2xl p-6 sm:p-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <ATSScoreCard score={atsScore.total_score || 0} size="large" grade={atsScore.grade} />
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-2xl font-bold text-white mb-1">Resume Analysis Complete</h1>
                {data.from_cache && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-xs text-green-400 mb-2">
                    <span>✅</span> Loaded from cache — results are consistent with previous analysis
                  </div>
                )}
                <p className="text-surface-200 mb-4">
                  <span className="font-semibold text-white">{data.target_job_title}</span>
                  {' at '}
                  <span className="font-semibold text-primary-400">{data.target_company}</span>
                </p>
                <p className="text-sm text-surface-200 leading-relaxed mb-4">{atsScore.summary}</p>
                <div className="w-full max-w-md">
                  <p className="text-sm text-surface-200 mb-2">Semantic Match</p>
                  <SemanticMatchBar
                    percentage={semanticMatch.semantic_match_percentage || 0}
                    cosineValue={semanticMatch.cosine_similarity_raw}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Explainable AI — ATS Score Breakdown */}
          <section className="glass rounded-2xl p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Explainable ATS — How We Scored Your Resume
            </h2>
            <p className="text-xs text-surface-400 mb-6">Click any sub-score to see the exact evidence and reasoning.</p>

            <div className="space-y-3">
              {Object.entries(subScores).map(([key, sub]) => {
                const isExpanded = expandedScores[key];
                const pct = sub.max > 0 ? (sub.score / sub.max) : 0;
                const barColor = pct >= 0.7 ? 'bg-accent-500' : pct >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
                const labels = {
                  keyword_match: { icon: '🔑', title: 'Keyword Match', method: 'Algorithmic stemming — no LLM' },
                  semantic_similarity: { icon: '🧠', title: 'Semantic Similarity', method: 'OpenAI embedding cosine similarity' },
                  format_structure: { icon: '📐', title: 'Format & Structure', method: '100% regex + boolean checks — no LLM' },
                  skills_coverage: { icon: '🛠️', title: 'Skills Coverage', method: 'Stemmed keyword overlap — no LLM' },
                  experience_relevance: { icon: '💼', title: 'Experience Relevance', method: 'GPT-4o-mini @ temperature=0' },
                  education_match: { icon: '🎓', title: 'Education Match', method: 'GPT-4o-mini @ temperature=0' },
                };
                const meta = labels[key] || { icon: '📊', title: key.replace(/_/g, ' '), method: '' };

                return (
                  <div key={key} className="glass-light rounded-xl overflow-hidden">
                    {/* Clickable header */}
                    <button
                      onClick={() => setExpandedScores(prev => ({ ...prev, [key]: !prev[key] }))}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition"
                    >
                      <span className="text-xl">{meta.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-white">{meta.title}</span>
                          <span className="text-sm font-mono text-surface-200">{sub.score}/{sub.max}</span>
                        </div>
                        <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`}
                            style={{ width: `${pct * 100}%` }} />
                        </div>
                      </div>
                      <svg className={`w-4 h-4 text-surface-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expandable evidence panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-surface-700/50 pt-3 space-y-3 animate-fade-in">
                        <p className="text-xs text-surface-400 italic">Method: {meta.method}</p>

                        {/* Keyword Match Evidence */}
                        {key === 'keyword_match' && (
                          <>
                            <div>
                              <p className="text-xs font-semibold text-accent-400 mb-1">
                                ✓ Matched ({(sub.matched || []).length} keywords)
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(sub.matched || []).map((kw, i) => (
                                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-400 border border-green-500/30">{kw}</span>
                                ))}
                                {!(sub.matched || []).length && <span className="text-xs text-surface-500">None matched</span>}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-red-400 mb-1">
                                ✗ Missing ({(sub.missing || []).length} keywords)
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(sub.missing || []).slice(0, 20).map((kw, i) => (
                                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-red-500/15 text-red-400 border border-red-500/30">{kw}</span>
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-surface-400">
                              Formula: ({(sub.matched || []).length} matched / {(sub.matched || []).length + (sub.missing || []).length} JD keywords) × {sub.max} = <b className="text-white">{sub.score}</b>
                            </p>
                          </>
                        )}

                        {/* Semantic Similarity Evidence */}
                        {key === 'semantic_similarity' && (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="text-center">
                                <p className="text-2xl font-bold text-primary-400">{sub.cosine_value || '—'}</p>
                                <p className="text-xs text-surface-400">Cosine Similarity</p>
                              </div>
                              <div className="flex-1 text-xs text-surface-300 leading-relaxed">
                                <p>Your resume text was embedded into a 1536-dim vector using OpenAI <code className="text-primary-400">text-embedding-3-small</code>.</p>
                                <p className="mt-1">The generated job description was embedded the same way. The cosine similarity between these two vectors measures how semantically close your resume is to the role.</p>
                                <p className="mt-1">Formula: cosine({sub.cosine_value || '?'}) × {sub.max} = <b className="text-white">{sub.score}</b></p>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Format & Structure Evidence */}
                        {key === 'format_structure' && sub.checks && (
                          <div className="space-y-2">
                            {Object.entries(sub.checks).map(([checkKey, check]) => (
                              <div key={checkKey} className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface-800/50">
                                <span className="text-surface-200 capitalize">{checkKey.replace(/_/g, ' ')}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-surface-400">{check.detail}</span>
                                  <span className="font-mono text-white">{check.score}/{check.max}</span>
                                </div>
                              </div>
                            ))}
                            <p className="text-xs text-surface-400">
                              All checks are deterministic regex/boolean — no AI involved. Sum: <b className="text-white">{sub.score}/{sub.max}</b>
                            </p>
                          </div>
                        )}

                        {/* Skills Coverage Evidence */}
                        {key === 'skills_coverage' && (
                          <>
                            <div>
                              <p className="text-xs font-semibold text-accent-400 mb-1">
                                ✓ Covered ({(sub.covered || []).length} skills)
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(sub.covered || []).map((kw, i) => (
                                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-400 border border-green-500/30">{kw}</span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-red-400 mb-1">
                                ✗ Gaps ({(sub.missing || []).length} skills)
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(sub.missing || []).slice(0, 20).map((kw, i) => (
                                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-red-500/15 text-red-400 border border-red-500/30">{kw}</span>
                                ))}
                              </div>
                            </div>
                            <p className="text-xs text-surface-400">
                              Formula: ({(sub.covered || []).length} covered / {(sub.covered || []).length + (sub.missing || []).length} JD skills) × {sub.max} = <b className="text-white">{sub.score}</b>
                            </p>
                          </>
                        )}

                        {/* Experience Relevance Evidence */}
                        {key === 'experience_relevance' && (
                          <div className="text-xs text-surface-300 leading-relaxed">
                            <p>GPT-4o-mini rated how relevant your experience + projects are to <b className="text-white">{data.target_job_title}</b> at <b className="text-primary-400">{data.target_company}</b>.</p>
                            <p className="mt-1">Scale: 0 (irrelevant) → 10 (perfectly aligned). Temperature=0 for determinism.</p>
                            <p className="mt-1">Score: <b className="text-white">{sub.score}/{sub.max}</b></p>
                          </div>
                        )}

                        {/* Education Match Evidence */}
                        {key === 'education_match' && (
                          <div className="text-xs text-surface-300 leading-relaxed">
                            <p>GPT-4o-mini rated education match: 5=strong, 3=partial, 1=weak for <b className="text-white">{data.target_job_title}</b>.</p>
                            <p className="mt-1">Temperature=0 — same transcript always gets the same score.</p>
                            <p className="mt-1">Score: <b className="text-white">{sub.score}/{sub.max}</b></p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total formula */}
            <div className="mt-6 p-3 rounded-xl bg-surface-800/50 border border-surface-700/50">
              <p className="text-xs text-surface-300 text-center">
                <b className="text-white">Total ATS Score</b> ={' '}
                {Object.entries(subScores).map(([key, sub], i) => (
                  <span key={key}>
                    {i > 0 && ' + '}
                    <span className="text-primary-400">{sub.score}</span>
                  </span>
                ))}
                {' '}= <b className="text-lg text-white">{atsScore.total_score}/100</b>{' '}
                <span className={`font-bold ${atsScore.grade === 'A' ? 'text-green-400' : atsScore.grade === 'B+' || atsScore.grade === 'B' ? 'text-amber-400' : 'text-red-400'}`}>
                  ({atsScore.grade})
                </span>
              </p>
            </div>
          </section>

          {/* Section 3: Semantic Match Analysis */}
          <section className="glass rounded-2xl p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '200ms' }}>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Semantic Match Analysis
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="glass-light rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-primary-400">{semanticMatch.semantic_match_percentage || 0}%</p>
                <p className="text-xs text-surface-200 mt-1">Match Percentage</p>
              </div>
              <div className="glass-light rounded-xl p-4 text-center">
                <p className="text-lg font-semibold text-white">{semanticMatch.cosine_similarity_raw || 'N/A'}</p>
                <p className="text-xs text-surface-200 mt-1">Cosine Similarity</p>
              </div>
              <div className="glass-light rounded-xl p-4 text-center">
                <p className="text-sm font-semibold text-white">{semanticMatch.closest_role_found || 'N/A'}</p>
                <p className="text-xs text-surface-200 mt-1">Closest Role Match</p>
              </div>
            </div>

            {/* Skill Alignment */}
            <div className="space-y-4">
              {skillGap.relevant_skills?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-accent-400 mb-2">✅ Relevant Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {skillGap.relevant_skills.map((s, i) => (
                      <SkillBadge key={i} skill={s} type="verified" />
                    ))}
                  </div>
                </div>
              )}
              {skillGap.missing_skills?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-400 mb-2">❌ Missing Critical Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {skillGap.missing_skills.map((s, i) => (
                      <SkillBadge key={i} skill={s} type="missing" />
                    ))}
                  </div>
                </div>
              )}
              {skillGap.bonus_skills?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-primary-400 mb-2">⭐ Bonus/Differentiator Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {skillGap.bonus_skills.map((s, i) => (
                      <SkillBadge key={i} skill={s} type="bonus" />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {semanticMatch.role_alignment_summary && (
              <div className="mt-6 glass-light rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Role Alignment Summary</h3>
                <p className="text-sm text-surface-200 leading-relaxed">{semanticMatch.role_alignment_summary}</p>
              </div>
            )}
          </section>

          {/* Section 4: Suggestions */}
          <section className="glass rounded-2xl p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '300ms' }}>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Personalised Suggestions
              <span className="ml-auto text-sm text-surface-700 font-normal">{suggestions.length} suggestions</span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suggestions.map((suggestion, i) => (
                <SuggestionCard key={i} suggestion={suggestion} index={i} />
              ))}
            </div>
          </section>

          {/* Section 5: LaTeX Resume */}
          <section className="glass rounded-2xl p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '400ms' }}>
            {data.latex_code && (
              <LaTeXPreview
                latexCode={data.latex_code}
                resumeId={resumeId}
                uid={user.uid}
              />
            )}
          </section>

          {/* Section 6: Job Recommendations */}
          {(recsLoading || recommendations) && (
            <section className="glass rounded-2xl p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '500ms' }}>
              <h2 className="text-xl font-bold text-white mb-4">🎯 Opportunities Matched to Your Profile</h2>
              {recsLoading ? (
                <div className="flex items-center gap-3 text-surface-400">
                  <div className="w-5 h-5 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                  Analyzing career opportunities...
                </div>
              ) : (
                <>
                  {/* Role Cards */}
                  {recommendations?.recommended_roles && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-surface-300 mb-3">Recommended Roles</h3>
                      <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
                        {recommendations.recommended_roles.map((role, i) => (
                          <div key={i} className="min-w-[260px] bg-surface-900/80 border border-surface-800 rounded-xl p-4 flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-white font-semibold text-sm">{role.title}</h4>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${role.match_percentage >= 80 ? 'bg-green-500/20 text-green-400' : role.match_percentage >= 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                {role.match_percentage}%
                              </span>
                            </div>
                            <p className="text-xs text-purple-400 font-medium mb-2">💰 {role.salary_range_inr}</p>
                            <p className="text-xs text-surface-400 mb-3 line-clamp-2">{role.why_match}</p>
                            <div className="flex flex-wrap gap-1">
                              {(role.skills_you_have || []).slice(0, 3).map((s, j) => (
                                <span key={j} className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">✓ {s}</span>
                              ))}
                              {(role.skills_to_learn || []).slice(0, 2).map((s, j) => (
                                <span key={j} className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">+ {s}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Company Cards */}
                  {recommendations?.recommended_companies && (
                    <div>
                      <h3 className="text-sm font-semibold text-surface-300 mb-3">Recommended Companies</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recommendations.recommended_companies.map((co, i) => (
                          <div key={i} className="bg-surface-900/80 border border-surface-800 rounded-xl p-4">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-white font-semibold text-sm">{co.name}</h4>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${co.match_percentage >= 80 ? 'bg-green-500/20 text-green-400' : co.match_percentage >= 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                {co.match_percentage}%
                              </span>
                            </div>
                            <p className="text-xs text-surface-400 mb-2 line-clamp-2">{co.why_fit}</p>
                            <p className="text-xs text-surface-500 mb-3">{co.culture_match}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => targetCompany(co.name)}
                                className="flex-1 text-xs py-1.5 bg-primary-600/20 text-primary-400 border border-primary-500/30 rounded-lg hover:bg-primary-600/30 transition"
                              >
                                🎯 Target
                              </button>
                              <a
                                href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(co.linkedin_search_query || co.name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-xs py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition text-center"
                              >
                                🔗 LinkedIn
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        {/* Section 6: History Sidebar (desktop only) */}
        <aside className="hidden xl:block w-72 flex-shrink-0">
          <div className="sticky top-20">
            <div className="glass rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Recent Analyses</h3>
              {history.length === 0 ? (
                <p className="text-xs text-surface-700">No previous analyses.</p>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 5).map((item) => (
                    <button
                      key={item.resume_id}
                      onClick={() => {
                        navigate(`/results/${item.resume_id}`);
                      }}
                      className={`w-full text-left rounded-xl p-3 transition-all border ${
                        item.resume_id === resumeId
                          ? 'bg-primary-500/10 border-primary-500/30'
                          : 'bg-surface-900/30 border-transparent hover:border-surface-700'
                      }`}
                    >
                      <p className="text-sm text-white font-medium truncate">
                        {item.target_job_title}
                      </p>
                      <p className="text-xs text-surface-200 truncate">{item.target_company}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-lg font-bold ${
                          item.ats_score >= 80 ? 'text-accent-400' :
                          item.ats_score >= 60 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {item.ats_score}
                        </span>
                        <span className="text-xs text-surface-700">
                          {new Date(item.submitted_at).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Results;
