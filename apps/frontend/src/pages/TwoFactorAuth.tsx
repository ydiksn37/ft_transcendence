import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const TwoFactorAuth: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tempToken = searchParams.get('tempToken');
  const method = searchParams.get('method');
  
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuth((state) => state.setAuth);
  const navigate = useNavigate();

  if (!tempToken) {
    return <div style={{ color: 'white' }}>Invalid 2FA Request</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otp }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Invalid OTP');
      }

      // Fetch user profile using new access token
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
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif', color: 'white' }}>
      <h2>Two-Factor Authentication</h2>
      <p>A verification code was sent via {method === 'EMAIL' ? 'Email' : 'SMS'}. Please enter it below.</p>
      
      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="Enter OTP Code" 
          value={otp} 
          onChange={(e) => setOtp(e.target.value)} 
          required 
          autoComplete="off"
          style={{ padding: '0.75rem', fontSize: '1.2rem', textAlign: 'center', letterSpacing: '4px' }}
        />
        <button type="submit" style={{ padding: '0.75rem', cursor: 'pointer', background: '#00babc', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Verify</button>
      </form>
    </div>
  );
};
