import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken) {
      // 一時的にtokenを保存して /api/users/me を叩いてユーザー情報を取得する
      fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
      })
      .then(user => {
        setAuth({ accessToken, refreshToken: refreshToken || undefined, user });
        navigate('/dashboard', { replace: true });
      })
      .catch(err => {
        console.error(err);
        navigate('/login', { replace: true });
      });
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate, setAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="text-neon-cyan">Authenticating...</div>
    </div>
  );
}
