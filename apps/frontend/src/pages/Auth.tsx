import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Auth: React.FC = () => {
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
      const user = await userRes.json();
      
      setAuth({ accessToken: data.accessToken, user });
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>{isLogin ? 'Login' : 'Register'}</h2>
      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!isLogin && (
          <>
            <input 
              type="email" 
              placeholder="Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
            <input 
              type="text" 
              placeholder="Username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
            />
            <input 
              type="text" 
              placeholder="Display Name" 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
            />
          </>
        )}
        
        {isLogin && (
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
        )}
        
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
        />
        
        <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
      </form>
      
      <button 
        onClick={() => setIsLogin(!isLogin)} 
        style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
      >
        {isLogin ? 'Need an account? Register' : 'Already have an account? Login'}
      </button>

      <hr style={{ margin: '2rem 0' }} />

      <button 
        onClick={() => window.location.href = '/api/auth/42'}
        style={{ 
          width: '100%', 
          padding: '0.75rem', 
          backgroundColor: '#00babc', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px', 
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '1rem'
        }}
      >
        Login with 42
      </button>
    </div>
  );
};
