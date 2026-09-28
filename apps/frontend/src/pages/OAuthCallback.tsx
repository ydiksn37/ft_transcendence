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

    const require2FA = searchParams.get('require2FA');
    const tempToken = searchParams.get('tempToken');
    const userId = searchParams.get('userId');

    const oauthError = searchParams.get('error');
    if (oauthError) {
      navigate(`/login?oauthError=${encodeURIComponent(oauthError)}`, { replace: true });
    } else if (require2FA === 'true' && tempToken && userId) {
      navigate(`/login?require2FA=true&tempToken=${tempToken}&userId=${userId}`, { replace: true });
    } else if (accessToken && refreshToken) {
      fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch user');
          return res.json();
        })
        .then((user) => {
          setAuth({ accessToken, refreshToken: refreshToken ?? undefined, user });
          
          const stateRedirect = searchParams.get('redirectTo');
          
          const cookieMatch = document.cookie.match(/(?:^|; )oauth_redirect=([^;]*)/);
          const cookieRedirect = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
          const redirectUrl = stateRedirect || localStorage.getItem('oauth_redirect') || cookieRedirect || '/menu';
          
          localStorage.removeItem('oauth_redirect');
          document.cookie = 'oauth_redirect=; path=/; max-age=0';
          
          navigate(redirectUrl, { replace: true });
        })
        .catch(() => {
          navigate('/login?oauthError=profile_fetch_failed', { replace: true });
        });
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate, setAuth]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'white' }}>
      <h2>Authenticating with 42...</h2>
    </div>
  );
};
