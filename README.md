# HireReady — AI-Powered Interview Preparation Platform

Full-stack application that helps students prepare for placements through AI-powered resume analysis, GitHub code review, and mock interviews.

## Quick Start

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Backend Environment

Fill in `backend/.env`:

```
GEMINI_API_KEY=your_gemini_key_from_aistudio.google.com
OPENAI_API_KEY=your_openai_key
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_secret
GITHUB_REDIRECT_URI=http://localhost:8000/github/callback
FRONTEND_URL=http://localhost:5173
```

### 3. Configure Frontend Environment

Fill in `frontend/.env`:

```
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Seed ChromaDB (auto-runs on startup, or run manually)

```bash
cd backend
python -m rag.seed
```

### 5. Start Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 6. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome (required for Speech Recognition).

## Architecture

```
backend/
├── main.py                    # FastAPI app + all routes
├── services/
│   ├── openai_client.py       # Shared OpenAI helpers
│   ├── pdf_extractor.py       # PDF text extraction
│   ├── resume_parser.py       # Resume → structured JSON
│   ├── ats_scorer.py          # ATS score calculation
│   ├── semantic_matcher.py    # Embedding-based matching
│   ├── suggestion_engine.py   # AI improvement suggestions
│   ├── latex_generator.py     # LaTeX resume generation
│   ├── github_service.py      # GitHub OAuth + code review
│   ├── interview_service.py   # Question gen + answer eval
│   └── db_service.py          # Firestore operations
├── rag/
│   ├── setup.py               # ChromaDB client setup
│   ├── seed.py                # Job roles seeder
│   └── embedder.py            # OpenAI embeddings
└── data/
    └── job_roles.json         # 20 job role descriptions

frontend/src/
├── config.js                  # API_URL config
├── firebase.js                # Firebase init
├── components/
│   ├── NavBar.jsx             # Global navigation
│   ├── ResumeForm.jsx         # Upload form
│   ├── ATSScoreCard.jsx       # Score ring
│   └── ...                    # Other UI components
└── pages/
    ├── Login.jsx              # Firebase Google Auth
    ├── Upload.jsx             # Resume upload
    ├── Results.jsx            # Analysis results
    ├── GitHub.jsx             # GitHub integration
    ├── Interview.jsx          # AI mock interview
    └── Dashboard.jsx          # PlaceScore dashboard
```

## Features

### Segment 1: Resume Analysis
- PDF upload → text extraction → AI parsing → structured JSON
- ATS score with 6 sub-scores (keyword match, semantic similarity, format, skills, experience, education)
- 8 personalized improvement suggestions
- LaTeX resume generation + download

### Segment 2: GitHub Integration
- GitHub OAuth or manual token entry
- GraphQL fetch of top 6 repositories
- AI code review per repo (quality, docs, complexity, security)
- Skill verification against resume
- GitHub score = average repo quality × 10

### Segment 3: AI Mock Interview
- 8 resume-specific questions (3 technical, 2 STAR, 2 project, 1 culture)
- Text-to-Speech question reading (SpeechSynthesis)
- Speech-to-Text answer recording (webkitSpeechRecognition)
- Auto-submit after 3 seconds of silence
- Real-time face detection for eye contact tracking
- Individual filler word counting (um, uh, like, basically, etc.)
- Per-answer AI evaluation + post-session performance report

### PlaceScore Dashboard
- **Formula**: (Resume ATS × 0.3) + (GitHub × 0.3) + (Interview × 0.4)
- Animated score ring with grade (A+ to F)
- Quick links to all three segments

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /analyze | Upload + analyze resume |
| GET | /resume-history/{uid} | Get user's past analyses |
| GET | /resume/{uid}/{id} | Get specific analysis |
| GET | /download-latex/{uid}/{id} | Download LaTeX PDF |
| GET | /github/auth | Start GitHub OAuth |
| GET | /github/callback | OAuth callback |
| POST | /github/sync | Sync repos + code review |
| GET | /github/results/{uid} | Get GitHub analysis |
| POST | /interview/generate-questions | Generate interview Qs |
| POST | /interview/evaluate-answer | Evaluate single answer |
| POST | /interview/submit-session | Submit full session |
| GET | /interview/sessions/{uid} | Get past sessions |
| GET | /placescore/{uid} | Get PlaceScore |
| POST | /placescore/{uid}/update | Recalculate PlaceScore |

## Tech Stack

- **Backend**: FastAPI, OpenAI GPT-4o-mini, ChromaDB, Firebase Admin
- **Frontend**: React 18, React Router, Tailwind CSS
- **Database**: Firebase Firestore
- **Auth**: Firebase Google Auth
- **AI**: OpenAI API (chat completions + embeddings)
