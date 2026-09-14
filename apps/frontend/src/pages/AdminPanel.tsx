import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Dashboard.css';

export default function AdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = new URLSearchParams(location.search).get('mode');

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
      navigate(mode ? `/profile?mode=${mode}` : '/profile');
      return;
    }
    fetchUsers();
  }, [user, navigate, mode]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      } else {
        throw new Error('Failed to fetch users');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      } else {
        alert('Failed to update role. Only ADMIN can do this.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBan = async (userId: string) => {
    const days = prompt('Enter BAN duration (in days):', '7');
    if (!days || isNaN(Number(days))) return;
    const reason = prompt('Enter BAN reason:', 'Violation of terms');
    if (!reason) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ durationDays: Number(days), reason })
      });
      if (res.ok) {
        alert('User has been banned.');
        fetchUsers();
      } else {
        alert('Failed to ban user.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnban = async (userId: string) => {
    if (!window.confirm('Are you sure you want to unban this user?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('User has been unbanned.');
        fetchUsers();
      } else {
        alert('Failed to unban user.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="dashboard-container" style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>LOADING...</div>;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header" style={{ justifyContent: 'space-between', width: '100%', maxWidth: '1000px', margin: '0 auto', marginBottom: '20px' }}>
        <button className="back-btn" onClick={() => navigate(mode ? `/profile?mode=${mode}` : '/profile')}>◀ BACK</button>
        <h1 style={{ color: '#e74c3c', fontSize: 'clamp(16px, 4vw, 32px)', textAlign: 'center', margin: '10px 0' }}>ADMIN PANEL</h1>
        <div style={{ width: '80px', visibility: 'hidden' }} className="mobile-hide"></div>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px' }}>{error}</div>}

      <div className="dashboard-grid" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
        {users.map((u) => {
          const isBanned = u.bannedUntil && new Date(u.bannedUntil) > new Date();
          return (
            <div key={u.id} className="arcade-panel" style={{ padding: '15px', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #444', paddingBottom: '10px', marginBottom: '10px' }}>
                <span style={{ color: '#3498db', fontSize: '12px', wordBreak: 'break-all' }}>{u.username}</span>
                <span style={{ color: isBanned ? '#e74c3c' : '#2ecc71', fontSize: '10px' }}>
                  {isBanned ? 'BANNED' : (u.isOnline ? 'ONLINE' : 'OFFLINE')}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#ccc', marginBottom: '15px', wordBreak: 'break-all' }}>{u.email}</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#888' }}>ROLE:</span>
                  <select 
                      value={u.role} 
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={user?.role !== 'ADMIN'}
                      style={{ backgroundColor: '#000', color: '#fff', border: '2px solid #555', padding: '5px', fontFamily: "'Press Start 2P', monospace", fontSize: '10px', cursor: 'pointer' }}
                    >
                      <option value="USER">USER</option>
                      <option value="MODERATOR">MODERATOR</option>
                      <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {isBanned ? (
                      <button onClick={() => handleUnban(u.id)} style={{ backgroundColor: '#2ecc71', color: 'white', border: '2px solid #fff', padding: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace", fontSize: '10px', width: '100%' }}>UNBAN USER</button>
                    ) : (
                      <button onClick={() => handleBan(u.id)} style={{ backgroundColor: '#e74c3c', color: 'white', border: '2px solid #fff', padding: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace", fontSize: '10px', width: '100%' }}>BAN USER</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
