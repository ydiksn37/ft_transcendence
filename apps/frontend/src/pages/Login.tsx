import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  
  const setAuth = useAuth((state) => state.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin 
        ? { email, password } 
        : { email, username, password, displayName: displayName || username };
        
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      if (data.requires2FA) {
        navigate(`/auth/2fa?tempToken=${data.tempToken}&method=${data.method}`);
        return;
      }

      // Fetch user profile
      const userRes = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${data.accessToken}` }
      });
      
      if (!userRes.ok) {
        throw new Error('Failed to fetch user profile');
      }
      const user = await userRes.json();
      
      setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user });
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 font-sans text-zinc-100">
      <div className="w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl">
        <h1 className="mb-6 text-center text-3xl font-black tracking-widest text-white">
          TETRIS
        </h1>
        
        <div className="mb-6 flex rounded-lg bg-zinc-800 p-1">
          <button
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${isLogin ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            onClick={() => { setIsLogin(true); setError(''); }}
          >
            Sign In
          </button>
          <button
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${!isLogin ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            onClick={() => { setIsLogin(false); setError(''); }}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-900/50 p-3 text-sm text-red-200 border border-red-900">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              placeholder="you@example.com"
              required 
            />
          </div>

          {!isLogin && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Username</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="PlayerOne"
                  required 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Display Name (Optional)</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="Player 1"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              placeholder="••••••••"
              required 
            />
          </div>

          <button 
            type="submit"
            className="mt-2 w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-zinc-900 px-2 text-zinc-500">OR CONTINUE WITH</span>
          </div>
        </div>

        <button 
          onClick={() => window.location.href = '/api/auth/42'}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.33 11.67L15 15l-1.67-1.67L15 11.67l1.33 2zm-8.66 0L9 15l-1.67-1.67L9 11.67l-1.33 2z"/>
          </svg>
          School 42
        </button>
      </div>
    </div>
  );
}