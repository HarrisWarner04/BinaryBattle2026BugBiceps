import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.currentUser) {
      navigate('/upload', { replace: true });
    }
  }, [navigate]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/upload', { replace: true });
    } catch (error) {
      console.error('Login failed:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        return; // User closed the popup, not an error
      }
      if (error.code === 'auth/unauthorized-domain') {
        alert('Login failed: localhost is not an authorized domain.\n\nFix: Go to Firebase Console → Authentication → Settings → Authorized domains → Add "localhost"');
      } else if (error.code === 'auth/operation-not-allowed') {
        alert('Login failed: Google Sign-In is not enabled.\n\nFix: Go to Firebase Console → Authentication → Sign-in method → Enable Google');
      } else if (error.code === 'auth/internal-error') {
        alert(`Login failed: Internal error.\n\nThis usually means the Firebase project needs Google Sign-In enabled.\n\nGo to: https://console.firebase.google.com → Authentication → Sign-in method → Enable Google`);
      } else {
        alert(`Login failed (${error.code}): ${error.message}`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-600/5 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="glass rounded-2xl p-8 text-center animate-fade-in">
          {/* Logo area */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 mb-6 shadow-lg shadow-primary-500/25">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-4xl font-extrabold gradient-text mb-2">HireReady</h1>
            <p className="text-surface-200 text-lg font-light">Know your placement readiness.</p>
          </div>

          {/* Features list */}
          <div className="mb-8 text-left space-y-3">
            {[
              'AI-powered ATS score analysis',
              'Semantic match with dream companies',
              'Personalised improvement suggestions',
              'LaTeX resume generation',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-surface-200">
                <div className="w-5 h-5 rounded-full bg-accent-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* Google Sign-In Button */}
          <button
            id="google-login-btn"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white text-gray-800 font-semibold text-base hover:bg-gray-50 hover:shadow-lg hover:shadow-white/10 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          <p className="mt-6 text-xs text-surface-700">
            By signing in, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
