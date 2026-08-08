import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { TetrisGame } from './pages/TetrisGame';
import { Auth } from './pages/Auth';
import { OAuthCallback } from './pages/OAuthCallback';
import { useAuth } from './hooks/useAuth';
import './App.css';

function MainScreen() {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();

  return (
    <>
      <div style={{ padding: '1rem', background: '#333', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          {user ? `Welcome, ${user.displayName || user.username}!` : 'Welcome, Guest!'}
        </span>
        {user ? (
          <div>
            <button onClick={logout}>Logout</button>
          </div>
        ) : (
          <button onClick={() => navigate('/auth')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Login / Register</button>
        )}
      </div>
      <TetrisGame />
    </>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainScreen />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
