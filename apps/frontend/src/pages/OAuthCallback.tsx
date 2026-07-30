import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuth((state) => state.setAuth);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch user');
          return res.json();
        })
        .then((user) => {
          setAuth({ accessToken, user });
          navigate('/', { replace: true });
        })
        .catch((err) => {
          console.error(err);
          navigate('/', { replace: true });
        });
    } else {
      navigate('/', { replace: true });
    }
  }, [searchParams, navigate, setAuth]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'white' }}>
      <h2>Authenticating with 42...</h2>
    </div>
  );
};
