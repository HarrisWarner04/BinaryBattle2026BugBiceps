# HireReady — AI-Powered Placement Readiness Platform

> Know your placement readiness. Upload your resume, connect GitHub, take AI interviews — get a single PlaceScore that ranks you.

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Architecture
- **Frontend**: React 18 + Vite → Vercel
- **Backend**: FastAPI → Railway
- **AI**: OpenAI GPT-4o-mini + embeddings
- **Database**: Firebase Firestore
- **Vectors**: ChromaDB (persistent)
- **Face Detection**: MediaPipe FaceLandmarker

## Team: Bug Biceps
BinaryBattle 2026
