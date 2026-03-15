import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Filler words to detect
const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'so', 'well', 'hmm', 'er', 'ah'];

function Interview({ user }) {
  const navigate = useNavigate();

  // Interview setup
  const [company, setCompany] = useState('Google');
  const [jobTitle, setJobTitle] = useState('Software Engineer');
  const [difficulty, setDifficulty] = useState('intermediate');

  // Pre-fill from targeted companies (set from Results page recommendations)
  useEffect(() => {
    try {
      const targets = JSON.parse(localStorage.getItem('hr_targetCompanies') || '[]');
      if (targets.length > 0) setCompany(targets[targets.length - 1]); // Use most recent target
    } catch (e) {}
  }, []);

  // Interview state
  const [phase, setPhase] = useState('setup'); // setup | loading | interview | review | report
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState([]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [fillerCount, setFillerCount] = useState(0);
  const [fillerDetails, setFillerDetails] = useState({});
  const [timeLeft, setTimeLeft] = useState(120); // 2 min per question

  // Webcam & face tracking
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [eyeContactPct, setEyeContactPct] = useState(0);
  const [faceLookCount, setFaceLookCount] = useState(0);
  const [faceTotalCount, setFaceTotalCount] = useState(0);

  // TTS
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Report
  const [report, setReport] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  // Live indicators
  const [wpm, setWpm] = useState(0);
  const [confidence, setConfidence] = useState(50);
  const recordingStartRef = useRef(null);

  // Speech Recognition ref
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const transcriptLenRef = useRef(0);

  // MediaPipe FaceLandmarker ref (loaded lazily)
  const faceLandmarkerRef = useRef(null);
  const faceLandmarkerLoadingRef = useRef(false);

  // Start camera + face detection
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraOn(true);
        // Init MediaPipe FaceLandmarker (lazy, once)
        await initFaceLandmarker();
        startFaceTracking();
      }
    } catch (err) {
      console.warn('Camera not available:', err);
    }
  };

  // Initialize MediaPipe FaceLandmarker (loads WASM + model from CDN)
  const initFaceLandmarker = async () => {
    if (faceLandmarkerRef.current || faceLandmarkerLoadingRef.current) return;
    faceLandmarkerLoadingRef.current = true;
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      console.log('✅ MediaPipe FaceLandmarker loaded');
    } catch (err) {
      console.warn('⚠️ MediaPipe FaceLandmarker failed to load, face tracking disabled:', err);
      faceLandmarkerRef.current = null;
    } finally {
      faceLandmarkerLoadingRef.current = false;
    }
  };

  // Face tracking using MediaPipe FaceLandmarker
  const startFaceTracking = () => {
    let lookCount = 0;
    let totalCount = 0;

    const checkFace = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      totalCount++;
      setFaceTotalCount(totalCount);

      const landmarker = faceLandmarkerRef.current;
      if (!landmarker) {
        // Fallback: assume looking if video is playing (no face model loaded)
        lookCount++;
        setFaceLookCount(lookCount);
      } else {
        try {
          const result = landmarker.detectForVideo(videoRef.current, performance.now());
          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            // Face detected — check gaze using iris landmarks
            const lm = result.faceLandmarks[0];
            // Iris center landmarks: left=468, right=473
            // Eye corner landmarks: left inner=133, left outer=33, right inner=362, right outer=263
            if (lm.length > 473) {
              const leftIris = lm[468];
              const leftInner = lm[133];
              const leftOuter = lm[33];
              const leftCenter = (leftInner.x + leftOuter.x) / 2;
              const gazeOffset = Math.abs(leftIris.x - leftCenter);
              const eyeWidth = Math.abs(leftInner.x - leftOuter.x);
              // If iris is within 35% of eye center, consider it 'looking at camera'
              if (gazeOffset < eyeWidth * 0.35) {
                lookCount++;
                setFaceLookCount(lookCount);
              }
            } else {
              // Landmarks present but no iris — still count as face detected
              lookCount++;
              setFaceLookCount(lookCount);
            }
          }
          // If no face detected, don't increment lookCount
        } catch (err) {
          // Silent — don't break interview on face detection error
          lookCount++;
          setFaceLookCount(lookCount);
        }
      }

      const pct = totalCount > 0 ? Math.round((lookCount / totalCount) * 100) : 0;
      setEyeContactPct(pct);
    };

    faceIntervalRef.current = setInterval(checkFace, 2000); // Check every 2s
  };

  // Stop camera + face tracking
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      setCameraOn(false);
    }
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current);
      faceIntervalRef.current = null;
    }
    // Cleanup MediaPipe FaceLandmarker to release GPU resources
    if (faceLandmarkerRef.current) {
      try { faceLandmarkerRef.current.close(); } catch (e) {}
      faceLandmarkerRef.current = null;
    }
  };

  // Text-to-Speech
  const speak = (text) => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  };

  // Count filler words in text — returns { total, details: { word: count } }
  const countFillers = (text) => {
    const lower = text.toLowerCase();
    let total = 0;
    const details = {};
    FILLER_WORDS.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(regex);
      const count = matches ? matches.length : 0;
      if (count > 0) details[word] = count;
      total += count;
    });
    return { total, details };
  };

  // Speech-to-Text (Web Speech API)
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t + ' ';
        } else {
          interim = t;
        }
      }
      const fullText = finalTranscript + interim;
      setTranscript(fullText);
      const { total, details } = countFillers(fullText);
      setFillerCount(total);
      setFillerDetails(details);

      // Live WPM calculation
      if (recordingStartRef.current) {
        const elapsed = (Date.now() - recordingStartRef.current) / 1000 / 60; // minutes
        const words = fullText.trim().split(/\s+/).filter(w => w).length;
        if (elapsed > 0.05) setWpm(Math.round(words / elapsed));
      }

      // Confidence: increment on non-filler words, decrement on fillers
      const words = fullText.trim().split(/\s+/).filter(w => w);
      const lastWord = words[words.length - 1]?.toLowerCase() || '';
      if (FILLER_WORDS.some(f => lastWord.includes(f))) {
        setConfidence(prev => Math.max(0, prev - 5));
      } else if (words.length > 0) {
        setConfidence(prev => Math.min(100, prev + 1));
      }

      // Auto-submit on 3s silence if transcript > 30 chars
      transcriptLenRef.current = fullText.length;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (fullText.trim().length > 30) {
        silenceTimerRef.current = setTimeout(() => {
          if (transcriptLenRef.current === fullText.length) {
            // No new speech for 3s — auto-submit
            submitAnswer();
          }
        }, 3000);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        try { recognition.start(); } catch(e) {}
      }
    };

    recognition.onend = () => {
      if (isRecording) {
        try { recognition.start(); } catch(e) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setTimeLeft(120);
    recordingStartRef.current = Date.now();
    setWpm(0);
    setConfidence(50);

    // Timer
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopListening();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopListening = () => {
    setIsRecording(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // Generate questions
  const startInterview = async () => {
    setPhase('loading');
    try {
      await startCamera();
      const formData = new FormData();
      formData.append('uid', user.uid);
      formData.append('company', company);
      formData.append('job_title', jobTitle);
      formData.append('difficulty', difficulty);

      const res = await fetch(`${API_URL}/interview/generate-questions`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success && data.questions) {
        setQuestions(data.questions);
        setAnswers(new Array(data.questions.length).fill(''));
        setScores(new Array(data.questions.length).fill(null));
        setCurrentQ(0);
        setPhase('interview');
        // Read first question aloud
        await speak(`Question 1. ${data.questions[0].text}`);
      } else {
        alert('Failed to generate questions: ' + (data.detail || 'Unknown error'));
        setPhase('setup');
      }
    } catch (err) {
      alert('Failed to start interview: ' + err.message);
      setPhase('setup');
    }
  };

  // Submit current answer and move to next
  const submitAnswer = async () => {
    stopListening();
    setEvaluating(true);

    const currentTranscript = transcript;
    const newAnswers = [...answers];
    newAnswers[currentQ] = currentTranscript;
    setAnswers(newAnswers);

    // Evaluate
    try {
      const formData = new FormData();
      formData.append('question', questions[currentQ].text);
      formData.append('hint', questions[currentQ].ideal_answer_hint || '');
      formData.append('transcript', currentTranscript);
      formData.append('company', company);
      // Send ideal answer points for context-aware evaluation
      const pts = questions[currentQ].ideal_answer_points;
      if (pts && pts.length) formData.append('ideal_points', JSON.stringify(pts));

      const res = await fetch(`${API_URL}/interview/evaluate-answer`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      const newScores = [...scores];
      newScores[currentQ] = data;
      setScores(newScores);

      // Follow-up logic: if shallow answer and follow-up exists
      const followUp = questions[currentQ].follow_up;
      if (followUp && data.follow_up_triggered && (data.overall || 0) < 6) {
        await speak(`Follow-up: ${followUp}`);
      }
    } catch (err) {
      console.error('Evaluation failed:', err);
    }

    setEvaluating(false);

    // Next question or finish
    if (currentQ < questions.length - 1) {
      const nextQ = currentQ + 1;
      setCurrentQ(nextQ);
      setTranscript('');
      setFillerCount(0);
      setFillerDetails({});
      setTimeLeft(120);
      setWpm(0);
      setConfidence(50);

      // Read next question
      await speak(`Question ${nextQ + 1}. ${questions[nextQ].text}`);
    } else {
      setPhase('review');
    }
  };

  // Skip question
  const skipQuestion = async () => {
    stopListening();
    const newAnswers = [...answers];
    newAnswers[currentQ] = transcript || '(skipped)';
    setAnswers(newAnswers);

    if (currentQ < questions.length - 1) {
      const nextQ = currentQ + 1;
      setCurrentQ(nextQ);
      setTranscript('');
      setFillerCount(0);
      setFillerDetails({});
      setTimeLeft(120);
      await speak(`Question ${nextQ + 1}. ${questions[nextQ].text}`);
    } else {
      setPhase('review');
    }
  };

  // Submit full session
  const submitSession = async () => {
    setSubmitting(true);
    try {
      const validScores = scores.filter(s => s !== null);
      const formData = new FormData();
      formData.append('uid', user.uid);
      formData.append('company', company);
      formData.append('job_title', jobTitle);
      formData.append('scores_json', JSON.stringify(validScores));
      formData.append('eye_contact_pct', eyeContactPct);
      formData.append('filler_count', fillerCount);

      const res = await fetch(`${API_URL}/interview/submit-session`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setReport(data.report);
        setPhase('report');
      } else {
        alert('Session submission failed');
      }
    } catch (err) {
      alert('Failed to submit session: ' + err.message);
    } finally {
      setSubmitting(false);
      stopCamera();
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopListening();
      stopCamera();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <canvas ref={canvasRef} className="hidden" />
      <div className="max-w-6xl mx-auto p-6">

        {/* ===== SETUP PHASE ===== */}
        {phase === 'setup' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-8 text-center space-y-4">
              <div className="text-5xl">🎙️</div>
              <h2 className="text-2xl font-bold">AI Mock Interview</h2>
              <p className="text-surface-400">
                8 resume-specific questions • AI voice • Face tracking • Real-time evaluation
              </p>
            </div>

            <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-sm text-surface-400 mb-1">Target Company</label>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white" />
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1">Job Title</label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white" />
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1">Difficulty</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <button onClick={startInterview}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg font-semibold text-lg hover:opacity-90 transition">
                🚀 Start Interview
              </button>
            </div>
          </div>
        )}

        {/* ===== LOADING PHASE ===== */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-surface-400">Generating personalized interview questions from your resume...</p>
          </div>
        )}

        {/* ===== INTERVIEW PHASE ===== */}
        {phase === 'interview' && questions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: webcam + stats */}
            <div className="space-y-4">
              <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
                <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-video bg-black" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-900/50 border border-surface-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{fillerCount}</div>
                  <div className="text-xs text-surface-400">Filler Words</div>
                </div>
                <div className="bg-surface-900/50 border border-surface-800 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${timeLeft <= 30 ? 'text-red-400' : 'text-green-400'}`}>
                    {formatTime(timeLeft)}
                  </div>
                  <div className="text-xs text-surface-400">Time Left</div>
                </div>
                <div className="bg-surface-900/50 border border-surface-800 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${eyeContactPct >= 60 ? 'text-green-400' : eyeContactPct >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {eyeContactPct}%
                  </div>
                  <div className="text-xs text-surface-400">Eye Contact</div>
                </div>
              </div>

              {/* Individual filler word breakdown */}
              {Object.keys(fillerDetails).length > 0 && (
                <div className="bg-surface-900/50 border border-yellow-500/20 rounded-lg p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(fillerDetails).map(([word, count]) => (
                      <span key={word} className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full">
                        "{word}" ×{count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Speaking Indicators */}
              {isRecording && (
                <div className="bg-surface-900/50 border border-surface-800 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-surface-400">WPM</span>
                    <span className={`text-sm font-bold ${wpm >= 90 && wpm <= 160 ? 'text-green-400' : wpm > 0 ? 'text-amber-400' : 'text-surface-500'}`}>
                      {wpm || '—'}
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-surface-400">Confidence</span>
                      <span className="text-xs text-surface-400">{confidence}%</span>
                    </div>
                    <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${confidence >= 60 ? 'bg-green-500' : confidence >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${confidence}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Progress */}
              <div className="bg-surface-900/50 border border-surface-800 rounded-lg p-3">
                <div className="flex justify-between text-xs text-surface-400 mb-1">
                  <span>Progress</span>
                  <span>{currentQ + 1} / {questions.length}</span>
                </div>
                <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                    style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Center: question + transcript */}
            <div className="lg:col-span-2 space-y-4">
              {/* Question */}
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-5">
                <div className="flex justify-between items-start mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    questions[currentQ].type === 'technical' ? 'bg-blue-500/20 text-blue-400' :
                    questions[currentQ].type === 'behavioural' || questions[currentQ].type === 'hr' ? 'bg-green-500/20 text-green-400' :
                    questions[currentQ].type === 'project' ? 'bg-purple-500/20 text-purple-400' :
                    questions[currentQ].type === 'culture' ? 'bg-orange-500/20 text-orange-400' :
                    questions[currentQ].type === 'github' ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {questions[currentQ].type === 'hr' ? 'behavioural' : questions[currentQ].type}
                  </span>
                  <span className="text-sm text-surface-400">Q{currentQ + 1}</span>
                </div>
                <p className="text-lg font-medium">{questions[currentQ].text}</p>
                {isSpeaking && (
                  <div className="mt-2 flex items-center gap-2 text-purple-400 text-sm">
                    <div className="flex gap-0.5">
                      {[0,1,2,3].map(i => (
                        <div key={i} className="w-1 bg-purple-400 rounded-full animate-pulse" style={{height: `${8+Math.random()*12}px`, animationDelay: `${i*0.1}s`}} />
                      ))}
                    </div>
                    Speaking...
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                {!isRecording ? (
                  <button onClick={startListening} disabled={isSpeaking || evaluating}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-lg font-semibold transition disabled:opacity-50">
                    🎤 Start Recording
                  </button>
                ) : (
                  <button onClick={stopListening}
                    className="flex-1 py-3 bg-surface-700 hover:bg-surface-600 rounded-lg font-semibold transition">
                    ⏹ Stop Recording
                  </button>
                )}
                <button onClick={submitAnswer} disabled={evaluating || (!transcript && !isRecording)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50">
                  {evaluating ? '⏳ Evaluating...' : '✓ Submit Answer'}
                </button>
                <button onClick={skipQuestion}
                  className="px-4 py-3 bg-surface-800 border border-surface-700 rounded-lg hover:bg-surface-700 transition text-surface-400">
                  Skip →
                </button>
              </div>

              {/* Live transcript */}
              <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-4">
                <div className="text-sm text-surface-400 mb-2">Live Transcript</div>
                <div className="min-h-[100px] text-surface-200 whitespace-pre-wrap">
                  {transcript || (isRecording ? 'Listening...' : 'Press "Start Recording" to begin')}
                </div>
              </div>

              {/* Previous score */}
              {currentQ > 0 && scores[currentQ - 1] && (
                <div className="bg-surface-900/50 border border-green-500/20 rounded-lg p-3">
                  <div className="text-sm text-green-400 mb-1">Previous Answer Score</div>
                  <div className="flex gap-4 text-sm">
                    <span>Overall: <b>{scores[currentQ-1].overall}/10</b></span>
                    <span>Relevance: <b>{scores[currentQ-1].relevance}/10</b></span>
                    <span>Communication: <b>{scores[currentQ-1].communication}/10</b></span>
                  </div>
                  <p className="text-xs text-surface-400 mt-1">{scores[currentQ-1].brief_feedback}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== REVIEW PHASE ===== */}
        {phase === 'review' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-6 text-center space-y-4">
              <div className="text-5xl">🎉</div>
              <h2 className="text-2xl font-bold">Interview Complete!</h2>
              <p className="text-surface-400">Review your answers, then generate your performance report.</p>
            </div>

            {/* Answer summary */}
            {questions.map((q, idx) => (
              <div key={idx} className="bg-surface-900/50 border border-surface-800 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-purple-400">Q{idx + 1}: {q.type}</span>
                  {scores[idx] && <span className="font-bold text-green-400">{scores[idx].overall}/10</span>}
                </div>
                <p className="font-medium text-sm">{q.text}</p>
                <p className="text-xs text-surface-400">{answers[idx]?.substring(0, 200) || '(no answer)'}{answers[idx]?.length > 200 ? '...' : ''}</p>
              </div>
            ))}

            <button onClick={submitSession} disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg font-semibold text-lg hover:opacity-90 transition disabled:opacity-50">
              {submitting ? '⏳ Generating Report...' : '📊 Generate Performance Report'}
            </button>
          </div>
        )}

        {/* ===== REPORT PHASE ===== */}
        {phase === 'report' && report && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Score banner */}
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Interview Report</h2>
                <p className="text-surface-400">{company} • {jobTitle}</p>
                <p className="text-sm text-surface-500 mt-1">{report.performance_level}</p>
              </div>
              <div className="text-5xl font-black text-purple-400">
                {report.calculated_score || report.overall_score}<span className="text-2xl text-surface-400">/100</span>
              </div>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-900/50 border border-green-500/20 rounded-xl p-4">
                <h3 className="text-green-400 font-semibold mb-2">💪 Top Strengths</h3>
                <ul className="space-y-1">
                  {(report.top_strengths || []).map((s, i) => (
                    <li key={i} className="text-sm text-surface-300 flex gap-2"><span className="text-green-500">✓</span>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-surface-900/50 border border-yellow-500/20 rounded-xl p-4">
                <h3 className="text-yellow-400 font-semibold mb-2">📈 Key Improvements</h3>
                <ul className="space-y-1">
                  {(report.key_improvements || []).map((s, i) => (
                    <li key={i} className="text-sm text-surface-300 flex gap-2"><span className="text-yellow-500">→</span>{s}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Communication feedback */}
            <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-4">
              <h3 className="font-semibold mb-2">🗣️ Communication</h3>
              <p className="text-sm text-surface-300">{report.communication_feedback}</p>
              <div className="flex gap-4 mt-2 text-sm">
                <span>Eye Contact: <b className="text-purple-400">{eyeContactPct}%</b></span>
                <span>Filler Words: <b className="text-yellow-400">{fillerCount}</b></span>
              </div>
            </div>

            {/* Company readiness */}
            <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-4">
              <h3 className="font-semibold mb-2">🏢 {company} Readiness</h3>
              <p className="text-sm text-surface-300">{report.company_readiness}</p>
            </div>

            {/* Recommended resources */}
            {report.recommended_resources?.length > 0 && (
              <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-4">
                <h3 className="font-semibold mb-2">📚 Recommended Resources</h3>
                <div className="space-y-2">
                  {report.recommended_resources.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                      className="block text-sm text-blue-400 hover:underline">{r.title} ({r.type})</a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => { setPhase('setup'); setReport(null); setQuestions([]); setScores([]); setAnswers([]); }}
                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg font-semibold hover:opacity-90 transition">
                🔄 Retake Interview
              </button>
              <button onClick={() => navigate('/dashboard')}
                className="flex-1 py-3 bg-surface-800 border border-surface-700 rounded-lg hover:bg-surface-700 transition">
                📊 View Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Interview;
