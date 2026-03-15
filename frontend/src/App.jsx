import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './pages/Login';
import Upload from './pages/Upload';
import Results from './pages/Results';
import GitHub from './pages/GitHub';
import Interview from './pages/Interview';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import NavBar from './components/NavBar';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-surface-200 text-sm">Loading PlaceScore...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {user && <NavBar user={user} />}
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route
          path="/upload"
          element={user ? <Upload user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/results/:resumeId"
          element={user ? <Results user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/github"
          element={user ? <GitHub user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/interview"
          element={user ? <Interview user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/leaderboard"
          element={<Leaderboard user={user} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
