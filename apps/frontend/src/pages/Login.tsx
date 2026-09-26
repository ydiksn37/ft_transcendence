import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import { DsAlert, DsButton, DsField, DsHeading, DsInput, DsPanel } from '../components/design-system';
import './Login.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [tempUserId, setTempUserId] = useState('');
  
  const setAuth = useAuth((state) => state.setAuth);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/menu';
  const cancelTo = searchParams.get('cancelTo') || '/';
  const { keyConfig } = useConfig();

  useEffect(() => {
    if (searchParams.get('require2FA') === 'true') {
      setRequire2FA(true);
      setTempToken(searchParams.get('tempToken') || '');
      setTempUserId(searchParams.get('userId') || '');
    }
  }, [searchParams]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === keyConfig.quitToMenu) {
        navigate(cancelTo);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyConfig.quitToMenu, navigate, cancelTo]);

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

      if (data.require2FA) {
        setRequire2FA(true);
        setTempToken(data.tempToken);
        setTempUserId(data.userId);
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

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await fetch('/api/auth/2fa/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tempUserId, code: twoFactorCode, tempToken }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '2FA failed');
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
      <DsPanel className="login-panel">
        <DsHeading level={1} className="login-title">
          TETRIS
        </DsHeading>
        
        {!require2FA && <div className="login-tabs">
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
        </div>}

        {error && (
          <DsAlert tone="danger" className="error-message">
            {error}
          </DsAlert>
        )}

        {require2FA ? (
          <form onSubmit={handle2FASubmit} className="login-form">
            <DsField label="2FA CODE" className="form-group">
              <DsInput
                inputMode="numeric"
                autoComplete="one-time-code"
                type="text" 
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                className="retro-input"
                placeholder="123456"
                maxLength={6}
                required 
              />
            </DsField>
            <DsButton type="submit" className="submit-btn">VERIFY</DsButton>
            <DsButton type="button" className="tab-btn" style={{marginTop: '10px'}} onClick={() => setRequire2FA(false)}>CANCEL</DsButton>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
                    <DsField label="EMAIL" className="form-group">
                      <DsInput
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="retro-input"
                        placeholder="YOU@EXAMPLE.COM"
                        required 
                      />
                    </DsField>
          
                    {!isLogin && (
                      <>
                        <DsField label="USERNAME" className="form-group">
                          <DsInput
                            type="text" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="retro-input"
                            placeholder="PLAYER_ONE"
                            required 
                          />
                        </DsField>
                        <DsField label="DISPLAY NAME (OPTIONAL)" className="form-group">
                          <DsInput
                            type="text" 
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="retro-input"
                            placeholder="PLAYER 1"
                          />
                        </DsField>
                      </>
                    )}
          
                    <DsField label="PASSWORD" className="form-group">
                      <DsInput
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="retro-input"
                        placeholder="********"
                        required 
                      />
                    </DsField>
          
                    <DsButton
                      type="submit"
                      className="submit-btn"
                    >
                      {isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}
                    </DsButton>
                  </form>
        )}

        {!require2FA && <><div className="separator">
          <span>OR CONTINUE WITH</span>
        </div>

        <DsButton
          onClick={(e) => {
            e.preventDefault();
            localStorage.setItem('oauth_redirect', redirectTo);
            document.cookie = `oauth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=300`;
            window.location.href = `/api/auth/42?state=${encodeURIComponent(redirectTo)}`;
          }}
          className="oauth-btn"
        >
          SCHOOL 42
        </DsButton></>}
      </DsPanel>
    </div>
  );
}
