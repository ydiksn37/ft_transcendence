import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Login.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  
  const setAuth = useAuth((state) => state.setAuth);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/menu';

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
      navigate(redirectTo);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="login-container">
      <div className="login-panel">
        <h1 className="login-title">
          TETRIS
        </h1>
        
        <div className="login-tabs">
          <button
            className={`tab-btn ${isLogin ? 'active' : ''}`}
            onClick={() => { 
              setIsLogin(true); 
              setError(''); 
              setEmail('');
              setPassword('');
              setUsername('');
              setDisplayName('');
            }}
          >
            SIGN IN
          </button>
          <button
            className={`tab-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => { 
              setIsLogin(false); 
              setError(''); 
              setEmail('');
              setPassword('');
              setUsername('');
              setDisplayName('');
            }}
          >
            REGISTER
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>EMAIL</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="retro-input"
              placeholder="YOU@EXAMPLE.COM"
              required 
            />
          </div>

          {!isLogin && (
            <>
              <div className="form-group">
                <label>USERNAME</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="retro-input"
                  placeholder="PLAYER_ONE"
                  required 
                />
              </div>
              <div className="form-group">
                <label>DISPLAY NAME (OPTIONAL)</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="retro-input"
                  placeholder="PLAYER 1"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>PASSWORD</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="retro-input"
              placeholder="********"
              required 
            />
          </div>

          <button 
            type="submit"
            className="submit-btn"
          >
            {isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div className="separator">
          <span>OR CONTINUE WITH</span>
        </div>

        <button 
          onClick={(e) => {
            e.preventDefault();
            localStorage.setItem('oauth_redirect', redirectTo);
            document.cookie = `oauth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=300`;
            window.location.href = `/api/auth/42?state=${encodeURIComponent(redirectTo)}`;
          }}
          className="oauth-btn"
        >
          SCHOOL 42
        </button>
      </div>
    </div>
  );
}