import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/upload', label: 'Resume', icon: '📄' },
  { path: '/github', label: 'GitHub', icon: '🐙' },
  { path: '/interview', label: 'Interview', icon: '🎙️' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
];

function NavBar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <nav className="bg-surface-900/80 backdrop-blur-md border-b border-surface-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <button
          onClick={() => navigate('/dashboard')}
          className="text-lg font-bold bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent hover:opacity-80 transition"
        >
          PlaceScore
        </button>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path === '/upload' && location.pathname.startsWith('/results'));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-surface-700 text-white'
                    : 'text-surface-400 hover:text-white hover:bg-surface-800'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-surface-500 hidden md:inline">
            {user?.displayName || user?.email?.split('@')[0]}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs px-2.5 py-1 rounded-md bg-surface-800 text-surface-400 hover:text-red-400 hover:bg-surface-700 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

export default NavBar;
