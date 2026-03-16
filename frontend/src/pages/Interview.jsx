import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'so', 'well', 'hmm', 'er', 'ah'];

function Interview({ user }) {
  const navigate = useNavigate();

  // Setup
  const [company, setCompany] = useState('Google');
  const [jobTitle, setJobTitle] = useState('Software Engineer');
  const [difficulty, setDifficulty] = useState('intermediate');

  useEffect(() => {
    try {
      const targets = JSON.parse(localStorage.getItem('hr_targetCompanies') || '[]');
      if (targets.length > 0) setCompany(targets[targets.length - 1]);
    } catch (e) {}
  }, []);

  // State
  const [phase, setPhase] = useState('setup');
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState([]);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [fillerCount, setFillerCount] = useState(0);
  const [fillerDetails, setFillerDetails] = useState({});
  const [timeLeft, setTimeLeft] = useState(120);
  const [micStatus, setMicStatus] = useState('idle');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  // Camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [eyeContactPct, setEyeContactPct] = useState(0);
  const eyeDataRef = useRef({ look: 0, total: 0 });
  const faceIntervalRef = useRef(null);

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

  // Audio visualization
  const [audioLevel, setAudioLevel] = useState(0);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  // Whisper
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const transcriptAccRef = useRef('');
  const timerRef = useRef(null);
  const whisperIntervalRef = useRef(null);
  const isRecordingRef = useRef(false);
  const micStreamRef = useRef(null);

  // ======================== CAMERA ========================

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      setCameraOn(true);
      attachStreamToVideo();
      startFaceDetection();
    } catch (err) {
      console.warn('Camera error:', err.message);
    }
  };

  const attachStreamToVideo = () => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play().catch(() => {});
      };
    }
  };

  useEffect(() => {
    if (phase === 'interview' && streamRef.current && videoRef.current) {
      attachStreamToVideo();
    }
  }, [phase]);

  // Enhanced face detection using skin color + centered face check
  const startFaceDetection = () => {
    if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d');
    let frameCount = 0;

    faceIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      frameCount++;
      try {
        ctx.drawImage(videoRef.current, 0, 0, 160, 120);
        // Sample center region (where face should be for eye contact)
        const centerData = ctx.getImageData(40, 15, 80, 70).data;
        // Also sample edges to compare
        const edgeData = ctx.getImageData(0, 0, 30, 30).data;

        let centerSkinPixels = 0;
        let centerTotalPixels = 0;
        let edgeSkinPixels = 0;

        // Count skin-colored pixels in center
        for (let i = 0; i < centerData.length; i += 4) {
          const r = centerData[i], g = centerData[i+1], b = centerData[i+2];
          centerTotalPixels++;
          // Skin color detection (works for various skin tones)
          if (r > 60 && g > 40 && b > 20 && r > g && r > b &&
              Math.abs(r - g) > 10 && r - b > 15 && r < 250) {
            centerSkinPixels++;
          }
        }

        // Count skin pixels in edge (should be fewer if face is centered)
        for (let i = 0; i < edgeData.length; i += 4) {
          const r = edgeData[i], g = edgeData[i+1], b = edgeData[i+2];
          if (r > 60 && g > 40 && b > 20 && r > g && r > b &&
              Math.abs(r - g) > 10 && r - b > 15 && r < 250) {
            edgeSkinPixels++;
          }
        }

        const skinRatio = centerSkinPixels / Math.max(centerTotalPixels, 1);
        const edgeSkinRatio = edgeSkinPixels / Math.max(edgeData.length / 4, 1);

        eyeDataRef.current.total++;

        // Face centered and looking at camera: high skin ratio in center, lower in edges
        if (skinRatio > 0.15) {
          // Face is present in center
          if (skinRatio > 0.3 && skinRatio > edgeSkinRatio * 1.5) {
            // Face well-centered — good eye contact
            eyeDataRef.current.look++;
          } else if (skinRatio > 0.2) {
            // Face present but not perfectly centered — partial credit
            eyeDataRef.current.look += 0.6;
          } else {
            // Face barely visible — minimal credit
            eyeDataRef.current.look += 0.3;
          }
        }
        // No skin in center = looking away, no credit

        const pct = Math.round((eyeDataRef.current.look / Math.max(eyeDataRef.current.total, 1)) * 100);
        setEyeContactPct(Math.min(pct, 98)); // Cap at 98% — perfect eye contact is unrealistic
      } catch (e) {}
    }, 2000);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
  };

  // ======================== TTS ========================

  const speak = (text) => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();

      const doSpeak = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        // Try to pick a good English voice
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                             voices.find(v => v.lang.startsWith('en')) ||
                             voices[0];
        if (englishVoice) utterance.voice = englishVoice;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => { setIsSpeaking(false); resolve(); };
        utterance.onerror = (e) => {
          console.warn('TTS error:', e);
          setIsSpeaking(false);
          resolve();
        };
        window.speechSynthesis.speak(utterance);

        // Safety timeout: if TTS doesn't fire onend within 30s, resolve anyway
        setTimeout(() => {
          setIsSpeaking(false);
          resolve();
        }, 30000);
      };

      // Ensure voices are loaded (Chrome loads them async)
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        doSpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          doSpeak();
        };
        // Fallback: if voices never load, speak anyway after 1s
        setTimeout(doSpeak, 1000);
      }
    });
  };

  // ======================== FILLER DETECTION ========================

  const countFillers = (text) => {
    const lower = text.toLowerCase();
    let total = 0; const details = {};
    FILLER_WORDS.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(regex);
      const count = matches ? matches.length : 0;
      if (count > 0) details[word] = count;
      total += count;
    });
    return { total, details };
  };

  // ======================== CONFIDENCE SCORE ========================

  const updateConfidence = (transcriptText) => {
    const words = transcriptText.trim().split(/\s+/).filter(w => w);
    const wordCount = words.length;
    if (wordCount === 0) return;

    const { total: totalFillers } = countFillers(transcriptText);
    const elapsed = recordingStartRef.current ? (Date.now() - recordingStartRef.current) / 1000 / 60 : 1;
    const currentWpm = elapsed > 0.05 ? Math.round(wordCount / elapsed) : 0;

    let score = 50; // Base

    // WPM factor (ideal: 120-160 WPM for interviews)
    if (currentWpm >= 100 && currentWpm <= 170) score += 15;
    else if (currentWpm >= 80 && currentWpm <= 200) score += 8;
    else if (currentWpm > 200) score -= 10; // Too fast
    else if (currentWpm > 0 && currentWpm < 60) score -= 10; // Too slow

    // Filler ratio factor
    const fillerRatio = totalFillers / Math.max(wordCount, 1);
    if (fillerRatio < 0.03) score += 15;       // Barely any fillers
    else if (fillerRatio < 0.08) score += 8;   // Low fillers
    else if (fillerRatio < 0.15) score -= 5;   // Moderate fillers
    else score -= 15;                           // Too many fillers

    // Answer length factor (longer = more thoughtful)
    if (wordCount > 80) score += 12;
    else if (wordCount > 40) score += 6;
    else if (wordCount < 15) score -= 10;

    // Eye contact factor
    if (eyeContactPct >= 70) score += 8;
    else if (eyeContactPct >= 40) score += 3;
    else score -= 5;

    setConfidence(Math.max(5, Math.min(98, score)));
  };

  // ======================== AUDIO VISUALIZATION ========================

  const startAudioVisualization = (stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!isRecordingRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.round(avg));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('Audio visualization failed:', e.message);
    }
  };

  // ======================== WHISPER TRANSCRIPTION ========================

  const sendAudioToWhisper = async (audioBlob) => {
    if (audioBlob.size < 2000) return; // Skip tiny chunks (silence/noise)
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const res = await fetch(`${API_URL}/interview/transcribe`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.text && data.text.trim()) {
        const newText = data.text.trim();

        // Filter out Whisper hallucinations (common patterns when there's silence)
        const hallucinations = [
          'shabbat shalom', 'thank you for watching', 'please subscribe',
          'thanks for watching', 'see you next time', 'bye bye',
          'you', 'the end', 'silence', 'music',
        ];
        const lowerText = newText.toLowerCase().trim();
        if (hallucinations.some(h => lowerText === h || lowerText === h + '.')) {
          console.log('🚫 Filtered Whisper hallucination:', newText);
          return;
        }

        // Since we send cumulative audio, Whisper returns the full transcript
        // Just replace the current transcript with the latest (most complete) version
        if (newText.length > transcriptAccRef.current.length * 0.5 || transcriptAccRef.current.length === 0) {
          // Update if longer or first transcription
          if (newText.length >= transcriptAccRef.current.length) {
            transcriptAccRef.current = newText;
          } else {
            // If shorter, append the new bits (partial recognition)
            transcriptAccRef.current += ' ' + newText;
          }
          setTranscript(transcriptAccRef.current);

          const { total, details } = countFillers(transcriptAccRef.current);
          setFillerCount(total);
          setFillerDetails(details);

          // WPM
          if (recordingStartRef.current) {
            const elapsed = (Date.now() - recordingStartRef.current) / 1000 / 60;
            const words = transcriptAccRef.current.trim().split(/\s+/).filter(w => w).length;
            if (elapsed > 0.05) setWpm(Math.round(words / elapsed));
          }

          // Update composite confidence
          updateConfidence(transcriptAccRef.current);
        }
        console.log('📝 Whisper:', newText);
      }
    } catch (err) {
      console.warn('Whisper error:', err.message);
    } finally {
      setTranscribing(false);
    }
  };

  const startListening = async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;

      // Start audio visualization
      startAudioVisualization(micStream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

      const recorder = new MediaRecorder(micStream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      transcriptAccRef.current = '';

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(1000);
      isRecordingRef.current = true;
      setIsRecording(true);
      setMicStatus('listening');
      setTimeLeft(120);
      recordingStartRef.current = Date.now();
      setWpm(0);
      setConfidence(50);

      // Send cumulative audio every 8 seconds for best Whisper accuracy
      whisperIntervalRef.current = setInterval(() => {
        if (audioChunksRef.current.length > 0 && isRecordingRef.current) {
          // Send ALL accumulated audio — Whisper works best with more context
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          // Keep only last 40 seconds to avoid huge requests
          if (audioChunksRef.current.length > 40) {
            audioChunksRef.current = audioChunksRef.current.slice(-40);
          }
          sendAudioToWhisper(blob);
        }
      }, 8000);

      // Countdown
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => { if (prev <= 1) { stopListening(); return 0; } return prev - 1; });
      }, 1000);

    } catch (err) {
      console.error('Mic failed:', err);
      setMicStatus('error');
    }
  };

  const stopListening = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setMicStatus('idle');
    setAudioLevel(0);

    // Cancel animation frame
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }

    // Send final chunk
    if (audioChunksRef.current.length > 0 && mediaRecorderRef.current) {
      const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
      sendAudioToWhisper(blob);
    }

    if (mediaRecorderRef.current?.state !== 'inactive') {
      try { mediaRecorderRef.current?.stop(); } catch (e) {}
    }
    mediaRecorderRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    if (whisperIntervalRef.current) { clearInterval(whisperIntervalRef.current); whisperIntervalRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ======================== INTERVIEW FLOW ========================

  const startInterview = async () => {
    setPhase('loading');
    try {
      await startCamera();
      const formData = new FormData();
      formData.append('uid', user.uid);
      formData.append('company', company);
      formData.append('job_title', jobTitle);
      formData.append('difficulty', difficulty);

      const res = await fetch(`${API_URL}/interview/generate-questions`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success && data.questions) {
        setQuestions(data.questions);
        setAnswers(new Array(data.questions.length).fill(''));
        setScores(new Array(data.questions.length).fill(null));
        setCurrentQ(0);
        setPhase('interview');
        await new Promise(r => setTimeout(r, 800));

        const firstName = user?.displayName?.split(' ')[0] || 'there';
        await speak(`Hello ${firstName}, welcome to your ${company} ${jobTitle} mock interview. I'll ask you ${data.questions.length} personalized questions based on your resume. Take your time, speak clearly, and look at the camera. Let's begin.`);
        await speak(`Question 1. ${data.questions[0].text}`);
        startListening();
      } else {
        alert('Failed to generate questions: ' + (data.detail || 'Unknown error'));
        setPhase('setup');
      }
    } catch (err) {
      alert('Failed: ' + err.message);
      setPhase('setup');
    }
  };

  const getAnswerText = () => transcript.trim() || typedAnswer.trim();

  const submitAnswer = async () => {
    stopListening();
    setEvaluating(true);
    await new Promise(r => setTimeout(r, 2000)); // Wait for final Whisper transcription

    const currentAnswer = getAnswerText();
    const newAnswers = [...answers];
    newAnswers[currentQ] = currentAnswer;
    setAnswers(newAnswers);

    try {
      const formData = new FormData();
      formData.append('question', questions[currentQ].text);
      formData.append('hint', questions[currentQ].ideal_answer_hint || '');
      formData.append('transcript', currentAnswer);
      formData.append('company', company);
      const pts = questions[currentQ].ideal_answer_points;
      if (pts?.length) formData.append('ideal_points', JSON.stringify(pts));

      const res = await fetch(`${API_URL}/interview/evaluate-answer`, { method: 'POST', body: formData });
      const data = await res.json();

      const newScores = [...scores];
      newScores[currentQ] = data;
      setScores(newScores);

      if (questions[currentQ].follow_up && data.follow_up_triggered && (data.overall || 0) < 6) {
        await speak(`Follow-up: ${questions[currentQ].follow_up}`);
      }
    } catch (err) {
      console.error('Evaluation failed:', err);
    }

    setEvaluating(false);

    if (currentQ < questions.length - 1) {
      const nextQ = currentQ + 1;
      setCurrentQ(nextQ);
      setTranscript(''); setTypedAnswer('');
      setFillerCount(0); setFillerDetails({});
      setTimeLeft(120); setWpm(0); setConfidence(50);
      transcriptAccRef.current = '';
      audioChunksRef.current = [];
      eyeDataRef.current = { look: 0, total: 0 };

      await speak(`Question ${nextQ + 1}. ${questions[nextQ].text}`);
      startListening();
    } else {
      setPhase('review');
    }
  };

  const skipQuestion = async () => {
    stopListening();
    const newAnswers = [...answers];
    newAnswers[currentQ] = getAnswerText() || '(skipped)';
    setAnswers(newAnswers);

    if (currentQ < questions.length - 1) {
      const nextQ = currentQ + 1;
      setCurrentQ(nextQ);
      setTranscript(''); setTypedAnswer('');
      setFillerCount(0); setFillerDetails({});
      setTimeLeft(120);
      transcriptAccRef.current = '';
      audioChunksRef.current = [];
      eyeDataRef.current = { look: 0, total: 0 };
      await speak(`Question ${nextQ + 1}. ${questions[nextQ].text}`);
      startListening();
    } else {
      setPhase('review');
    }
  };

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

      const res = await fetch(`${API_URL}/interview/submit-session`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { setReport(data.report); setPhase('report'); }
      else alert('Session submission failed');
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setSubmitting(false);
      stopCamera();
    }
  };

  useEffect(() => {
    return () => { stopListening(); stopCamera(); window.speechSynthesis?.cancel(); };
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ======================== AUDIO WAVEFORM COMPONENT ========================

  const AudioWaveform = () => {
    const bars = 20;
    return (
      <div className="flex items-end gap-[2px] h-8">
        {Array.from({ length: bars }).map((_, i) => {
          const height = isRecording
            ? Math.max(3, Math.min(32, (audioLevel / 255) * 32 * (0.4 + Math.sin(i * 0.7 + Date.now() * 0.003) * 0.6)))
            : 3;
          return (
            <div key={i} className="w-1 rounded-full transition-all duration-100"
              style={{
                height: `${height}px`,
                backgroundColor: audioLevel > 80 ? '#22c55e' : audioLevel > 30 ? '#eab308' : '#6b7280'
              }} />
          );
        })}
      </div>
    );
  };

  // ======================== RENDER ========================

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <div className="max-w-6xl mx-auto p-6">

        {/* SETUP */}
        {phase === 'setup' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-gradient-to-br from-purple-500/10 via-surface-900/50 to-pink-500/10 border border-purple-500/20 rounded-2xl p-8 text-center space-y-5">
              <div className="relative inline-block">
                <div className="text-6xl">🎙️</div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">AI Mock Interview</h2>
              <p className="text-surface-400 max-w-md mx-auto">
                Practice with an AI interviewer that adapts questions to your resume, tracks your body language, and gives real-time feedback.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {[
                  { icon: '🎤', label: 'Whisper AI Voice', color: 'blue' },
                  { icon: '👁️', label: 'Eye Tracking', color: 'purple' },
                  { icon: '📊', label: 'Live Analytics', color: 'green' },
                  { icon: '🧠', label: 'AI Scoring', color: 'yellow' },
                  { icon: '💬', label: 'Filler Detection', color: 'red' },
                  { icon: '📈', label: 'WPM Tracking', color: 'cyan' },
                ].map(({ icon, label, color }) => (
                  <span key={label} className={`px-3 py-1.5 bg-${color}-500/10 text-${color}-400 rounded-full text-xs font-medium border border-${color}-500/20`}>
                    {icon} {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-1.5 font-medium">🏢 Target Company</label>
                  <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
                </div>
                <div>
                  <label className="block text-sm text-surface-400 mb-1.5 font-medium">💼 Job Title</label>
                  <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1.5 font-medium">⚡ Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {['beginner', 'intermediate', 'advanced'].map(d => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      className={`py-2 rounded-lg text-sm font-medium transition capitalize ${
                        difficulty === d
                          ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                          : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                      }`}>{d}</button>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-500/20 rounded-xl p-4 text-sm text-surface-400 space-y-1.5">
                <p className="font-medium text-blue-400">💡 How it works:</p>
                <p>• AI generates <strong>8 personalized questions</strong> based on your resume &amp; projects</p>
                <p>• Your voice is transcribed by <strong>OpenAI Whisper</strong> — industry-leading accuracy</p>
                <p>• <strong>Eye contact, WPM, filler words</strong> are tracked in real-time</p>
                <p>• Each answer gets instant AI feedback with <strong>detailed scoring</strong></p>
              </div>

              <button onClick={startInterview}
                className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.01] transition-all duration-200">
                🚀 Start Interview
              </button>
            </div>
          </div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 space-y-6">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-3xl">🤖</div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Preparing your interview...</p>
              <p className="text-sm text-surface-400">Analyzing your resume and generating personalized questions</p>
            </div>
            <div className="flex gap-6 text-sm">
              <span className={cameraOn ? 'text-green-400' : 'text-yellow-400 animate-pulse'}>
                {cameraOn ? '✅ Camera ready' : '⏳ Camera...'}
              </span>
              <span className="text-yellow-400 animate-pulse">⏳ Generating questions...</span>
            </div>
          </div>
        )}

        {/* INTERVIEW */}
        {phase === 'interview' && questions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden relative group">
                <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-video bg-black" />
                {isRecording && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-500/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-white">REC</span>
                  </div>
                )}
                {/* Audio level overlay */}
                {isRecording && (
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                    <AudioWaveform />
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: fillerCount, label: 'Fillers', color: fillerCount === 0 ? 'text-green-400' : fillerCount < 5 ? 'text-yellow-400' : 'text-red-400' },
                  { value: formatTime(timeLeft), label: 'Time', color: timeLeft <= 30 ? 'text-red-400' : 'text-green-400' },
                  { value: `${eyeContactPct}%`, label: 'Eye Contact', color: eyeContactPct >= 60 ? 'text-green-400' : eyeContactPct >= 30 ? 'text-yellow-400' : 'text-red-400' },
                ].map(({ value, label, color }) => (
                  <div key={label} className="bg-surface-900/50 border border-surface-800 rounded-xl p-3 text-center">
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-surface-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* Filler breakdown */}
              {Object.keys(fillerDetails).length > 0 && (
                <div className="bg-surface-900/50 border border-yellow-500/20 rounded-xl p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(fillerDetails).map(([word, count]) => (
                      <span key={word} className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20">"{word}" ×{count}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance meters */}
              <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-surface-400 font-medium">Speaking Pace</span>
                  <span className={`text-sm font-bold ${wpm >= 90 && wpm <= 160 ? 'text-green-400' : wpm > 160 ? 'text-red-400' : wpm > 0 ? 'text-amber-400' : 'text-surface-500'}`}>{wpm ? `${wpm} WPM` : '—'}</span>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-surface-400 font-medium">Confidence Score</span>
                    <span className={`text-xs font-bold ${confidence >= 60 ? 'text-green-400' : confidence >= 35 ? 'text-amber-400' : 'text-red-400'}`}>{Math.round(confidence)}%</span>
                  </div>
                  <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${confidence >= 60 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : confidence >= 35 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-red-500 to-orange-400'}`}
                      style={{ width: `${confidence}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-surface-600">Nervous</span>
                    <span className="text-[10px] text-surface-600">Confident</span>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="bg-surface-900/50 border border-surface-800 rounded-xl p-3">
                <div className="flex justify-between text-xs text-surface-400 mb-1.5">
                  <span className="font-medium">Progress</span>
                  <span>{currentQ + 1} / {questions.length}</span>
                </div>
                <div className="h-2.5 bg-surface-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                    style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="lg:col-span-2 space-y-4">
              {/* AI speaking */}
              {isSpeaking && (
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-purple-500/20 animate-pulse">🤖</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-purple-300">AI Interviewer</div>
                    <div className="flex items-center gap-2 text-purple-400 text-xs mt-1">
                      <div className="flex gap-[2px] items-end">
                        {[0,1,2,3,4,5,6,7].map(i => (
                          <div key={i} className="w-[3px] bg-purple-400 rounded-full animate-pulse"
                            style={{height: `${3 + Math.sin(i * 0.8 + Date.now() * 0.005) * 10}px`, animationDelay: `${i * 0.1}s`}} />
                        ))}
                      </div>
                      Speaking...
                    </div>
                  </div>
                </div>
              )}

              {/* Question */}
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-6">
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    questions[currentQ].type === 'technical' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    questions[currentQ].type === 'behavioural' || questions[currentQ].type === 'hr' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    questions[currentQ].type === 'project' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                    'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                  }`}>{questions[currentQ].type === 'hr' ? 'behavioural' : questions[currentQ].type}</span>
                  <span className="text-sm font-medium text-surface-400 bg-surface-800 px-2 py-0.5 rounded">Q{currentQ + 1}/{questions.length}</span>
                </div>
                <p className="text-lg font-medium leading-relaxed">{questions[currentQ].text}</p>
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                {!isRecording ? (
                  <button onClick={startListening} disabled={isSpeaking || evaluating}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 hover:shadow-red-500/30">
                    <div className="w-3 h-3 bg-white rounded-full" /> Start Recording
                  </button>
                ) : (
                  <button onClick={stopListening}
                    className="flex-1 py-3 bg-surface-700 hover:bg-surface-600 rounded-xl font-semibold transition flex items-center justify-center gap-2">
                    <div className="w-3 h-3 bg-red-400 rounded-sm" /> Stop Recording
                  </button>
                )}
                <button onClick={submitAnswer} disabled={evaluating || !getAnswerText()}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 shadow-lg shadow-purple-500/20">
                  {evaluating ? '⏳ Evaluating...' : '✓ Submit'}
                </button>
                <button onClick={skipQuestion}
                  className="px-4 py-3 bg-surface-800 border border-surface-700 rounded-xl hover:bg-surface-700 transition text-surface-400">Skip →</button>
              </div>

              {/* Transcript */}
              <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-surface-300">Live Transcript</span>
                    {transcribing && <span className="text-xs text-yellow-400 animate-pulse font-medium">⚡ Transcribing...</span>}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    micStatus === 'listening' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    micStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-surface-700 text-surface-400'
                  }`}>
                    {micStatus === 'listening' && <span className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse" />}
                    {micStatus === 'listening' ? 'Recording' : micStatus === 'error' ? 'Mic Error' : 'Ready'}
                  </span>
                </div>
                <div className="min-h-[80px] text-surface-200 whitespace-pre-wrap text-sm leading-relaxed">
                  {transcript || (isRecording ? (
                    <span className="text-surface-500 italic flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Recording — transcript appears every ~5 seconds
                    </span>
                  ) : 'Press "Start Recording" or type below')}
                </div>
              </div>

              {/* Text fallback */}
              <details className="bg-surface-900/50 border border-surface-800 rounded-2xl">
                <summary className="p-4 cursor-pointer text-sm text-surface-400 hover:text-surface-300 transition">
                  ⌨️ Type Answer (backup if voice has issues)
                </summary>
                <div className="px-4 pb-4">
                  <textarea value={typedAnswer} onChange={e => setTypedAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-xl text-white text-sm resize-none h-24 placeholder:text-surface-600" />
                </div>
              </details>

              {/* Previous score */}
              {currentQ > 0 && scores[currentQ - 1] && (
                <div className="bg-surface-900/50 border border-green-500/20 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-400">Previous Answer Feedback</span>
                    <span className="text-lg font-bold text-green-400">{scores[currentQ-1].overall}/10</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-surface-800/50 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-surface-400">Relevance</span>
                      <span className="float-right text-sm font-semibold text-blue-400">{scores[currentQ-1].relevance}/10</span>
                    </div>
                    <div className="bg-surface-800/50 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-surface-400">Communication</span>
                      <span className="float-right text-sm font-semibold text-purple-400">{scores[currentQ-1].communication}/10</span>
                    </div>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed">{scores[currentQ-1].brief_feedback}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* REVIEW */}
        {phase === 'review' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-8 text-center space-y-4">
              <div className="text-6xl">🎉</div>
              <h2 className="text-3xl font-bold">Interview Complete!</h2>
              <p className="text-surface-400">Review your answers below, then generate your detailed performance report.</p>
              <div className="flex justify-center gap-6 text-sm">
                <span>Questions: <b className="text-purple-400">{questions.length}</b></span>
                <span>Answered: <b className="text-green-400">{answers.filter(a => a && a !== '(skipped)').length}</b></span>
                <span>Avg Score: <b className="text-yellow-400">{scores.filter(s=>s).length > 0 ? (scores.filter(s=>s).reduce((a,s)=>a+(s.overall||0),0) / scores.filter(s=>s).length).toFixed(1) : '—'}/10</b></span>
              </div>
            </div>
            {questions.map((q, idx) => (
              <div key={idx} className="bg-surface-900/50 border border-surface-800 rounded-2xl p-5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-purple-400 font-medium">Q{idx + 1} • {q.type}</span>
                  {scores[idx] ? <span className={`text-lg font-bold ${scores[idx].overall >= 7 ? 'text-green-400' : scores[idx].overall >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>{scores[idx].overall}/10</span> : <span className="text-surface-500 text-sm">—</span>}
                </div>
                <p className="font-medium text-sm">{q.text}</p>
                <p className="text-xs text-surface-400 leading-relaxed">{answers[idx]?.substring(0, 300) || '(no answer)'}{answers[idx]?.length > 300 ? '...' : ''}</p>
                {scores[idx]?.brief_feedback && <p className="text-xs text-surface-500 italic mt-1">💬 {scores[idx].brief_feedback}</p>}
              </div>
            ))}
            <button onClick={submitSession} disabled={submitting}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl font-semibold text-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50">
              {submitting ? '⏳ Generating Report...' : '📊 Generate Performance Report'}
            </button>
          </div>
        )}

        {/* REPORT */}
        {phase === 'report' && report && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-8 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Interview Report</h2>
                <p className="text-surface-400 mt-1">{company} • {jobTitle}</p>
                <p className="text-sm text-surface-500 mt-2 bg-surface-800 px-3 py-1 rounded-lg inline-block">{report.performance_level}</p>
              </div>
              <div className="text-center">
                <div className="text-6xl font-black bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent">{report.calculated_score || report.overall_score}</div>
                <div className="text-sm text-surface-400">/100</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-900/50 border border-green-500/20 rounded-2xl p-5">
                <h3 className="text-green-400 font-semibold mb-3 text-lg">💪 Strengths</h3>
                <ul className="space-y-2">{(report.top_strengths || []).map((s, i) => (
                  <li key={i} className="text-sm text-surface-300 flex gap-2"><span className="text-green-500 mt-0.5">✓</span>{s}</li>
                ))}</ul>
              </div>
              <div className="bg-surface-900/50 border border-yellow-500/20 rounded-2xl p-5">
                <h3 className="text-yellow-400 font-semibold mb-3 text-lg">📈 Improvements</h3>
                <ul className="space-y-2">{(report.key_improvements || []).map((s, i) => (
                  <li key={i} className="text-sm text-surface-300 flex gap-2"><span className="text-yellow-500 mt-0.5">→</span>{s}</li>
                ))}</ul>
              </div>
            </div>
            <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-2 text-lg">🗣️ Communication Analysis</h3>
              <p className="text-sm text-surface-300 leading-relaxed">{report.communication_feedback}</p>
              <div className="flex gap-6 mt-3 text-sm">
                <span>👁️ Eye Contact: <b className={eyeContactPct >= 60 ? 'text-green-400' : 'text-yellow-400'}>{eyeContactPct}%</b></span>
                <span>💬 Fillers: <b className={fillerCount < 5 ? 'text-green-400' : 'text-yellow-400'}>{fillerCount}</b></span>
              </div>
            </div>
            <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-2 text-lg">🏢 {company} Readiness</h3>
              <p className="text-sm text-surface-300 leading-relaxed">{report.company_readiness}</p>
            </div>
            {report.recommended_resources?.length > 0 && (
              <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-5">
                <h3 className="font-semibold mb-3 text-lg">📚 Resources</h3>
                <div className="space-y-2">{report.recommended_resources.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="block text-sm text-blue-400 hover:underline">{r.title} ({r.type})</a>
                ))}</div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setPhase('setup'); setReport(null); setQuestions([]); setScores([]); setAnswers([]); }}
                className="flex-1 py-3.5 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl font-semibold hover:opacity-90 transition">🔄 Retake</button>
              <button onClick={() => navigate('/dashboard')}
                className="flex-1 py-3.5 bg-surface-800 border border-surface-700 rounded-2xl hover:bg-surface-700 transition">📊 Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Interview;
