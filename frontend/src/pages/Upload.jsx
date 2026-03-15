import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ResumeForm from '../components/ResumeForm';
import LoadingScreen from '../components/LoadingScreen';
import { API_URL } from '../config';

const ANALYSIS_STEPS = [
  'Extracting resume content...',
  'Parsing structure...',
  'Generating LaTeX...',
  'Calculating ATS score...',
  'Running semantic analysis...',
  'Generating suggestions...',
  'Saving results...',
];

const CHECKLIST_ITEMS = [
  'ATS Score Calculation',
  'Semantic Match Analysis',
  'Keyword Gap Detection',
  'Skill Coverage Check',
  'LaTeX Resume Generation',
  '10 Personalised Suggestions',
];

function Upload({ user }) {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Fresher');
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');
  const [completedChecks, setCompletedChecks] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/resume-history/${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.resumes || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };


  const validateForm = () => {
    if (!selectedFile) { setError('Please upload your resume PDF.'); return false; }
    if (!company.trim()) { setError('Please enter your dream company.'); return false; }
    if (!jobTitle.trim()) { setError('Please enter your target job title.'); return false; }
    setError('');
    return true;
  };

  const simulateStepProgress = () => {
    // Simulate step progress while the API is working
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < ANALYSIS_STEPS.length - 1) {
        setCurrentStep(step);
        setCompletedChecks(prev => [...prev, CHECKLIST_ITEMS[Math.min(step - 1, CHECKLIST_ITEMS.length - 1)]]);
      } else {
        clearInterval(interval);
      }
    }, 3000);
    return interval;
  };

  const handleAnalyse = async () => {
    if (!validateForm()) return;

    setIsAnalysing(true);
    setCurrentStep(0);
    setCompletedChecks([]);
    setError('');

    const progressInterval = simulateStepProgress();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('company', company.trim());
      formData.append('job_title', jobTitle.trim());
      formData.append('uid', user.uid);

      const response = await fetch(`${API_URL}/analyse-resume`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errData.detail || `Server error: ${response.status}`);
      }

      const result = await response.json();

      // Show all steps completed
      setCurrentStep(ANALYSIS_STEPS.length);
      setCompletedChecks([...CHECKLIST_ITEMS]);

      // Brief pause to show completion state
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Navigate to results with the analysis data
      navigate(`/results/${result.resume_id}`, {
        state: { analysisData: result },
      });

    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message);
      setIsAnalysing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Loading Overlay */}
      {isAnalysing && (
        <LoadingScreen steps={ANALYSIS_STEPS} currentStep={currentStep} />
      )}



      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Upload Your Resume</h1>
          <p className="text-surface-200 text-base">Get AI-powered insights for your dream placement</p>
        </div>

        {error && (
          <div className="max-w-3xl mx-auto mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Three column cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left Card — Resume Upload */}
          <div className="glass rounded-2xl p-6 animate-slide-up">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary-500/20 flex items-center justify-center text-sm">1</span>
              Upload Resume
            </h2>
            <ResumeForm onFileSelect={setSelectedFile} selectedFile={selectedFile} />
          </div>

          {/* Middle Card — Company & Role */}
          <div className="glass rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center text-sm">2</span>
              Target Role
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-surface-200 mb-1.5">Dream Company</label>
                <input
                  id="company-input"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Google, TCS, Infosys, Amazon"
                  className="w-full px-4 py-3 rounded-xl bg-surface-900/60 border border-surface-700 text-white placeholder-surface-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition-all outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-surface-200 mb-1.5">Target Job Title</label>
                <input
                  id="job-title-input"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Software Engineer, Data Analyst"
                  className="w-full px-4 py-3 rounded-xl bg-surface-900/60 border border-surface-700 text-white placeholder-surface-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition-all outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-surface-200 mb-1.5">Experience Level</label>
                <select
                  id="experience-select"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-900/60 border border-surface-700 text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition-all outline-none text-sm appearance-none cursor-pointer"
                >
                  <option value="Fresher">Fresher</option>
                  <option value="1-3 years">1–3 years</option>
                  <option value="3+ years">3+ years</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Card — Analysis Checklist */}
          <div className="glass rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-accent-500/20 flex items-center justify-center text-sm">3</span>
              What We'll Analyse
            </h2>
            <div className="space-y-3">
              {CHECKLIST_ITEMS.map((item, i) => {
                const isCompleted = completedChecks.includes(item);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                      isCompleted
                        ? 'bg-accent-500 border-accent-500'
                        : 'border-surface-700'
                    }`}>
                      {isCompleted && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm transition-colors ${
                      isCompleted ? 'text-accent-400' : 'text-surface-200'
                    }`}>{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Analyse Button */}
        <div className="max-w-3xl mx-auto">
          <button
            id="analyse-btn"
            onClick={handleAnalyse}
            disabled={isAnalysing}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-bold text-lg transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed glow-blue shadow-lg shadow-primary-500/20"
          >
            {isAnalysing ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analysing...
              </span>
            ) : (
              '🚀 Analyse Resume'
            )}
          </button>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="max-w-3xl mx-auto mt-12">
            <h2 className="text-xl font-bold text-white mb-4">Previous Analyses</h2>
            <div className="space-y-3">
              {history.slice(0, 5).map((item) => (
                <button
                  key={item.resume_id}
                  onClick={() => navigate(`/results/${item.resume_id}`)}
                  className="w-full glass-light rounded-xl p-4 flex items-center justify-between hover:border-primary-500/30 transition-all text-left"
                >
                  <div>
                    <p className="text-white font-medium text-sm">
                      {item.target_job_title} at {item.target_company}
                    </p>
                    <p className="text-surface-700 text-xs mt-1">
                      {item.original_filename} • {new Date(item.submitted_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-white font-bold text-lg">{item.ats_score}</p>
                      <p className="text-xs text-surface-200">ATS Score</p>
                    </div>
                    <svg className="w-5 h-5 text-surface-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Upload;
