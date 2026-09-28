import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { parseBoundedInteger, validateLength } from '../lib/formValidation';
import './Dashboard.css';

export default function AdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = new URLSearchParams(location.search).get('mode');

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [newUser, setNewUser] = useState({ email: '', username: '', displayName: '', password: '' });
  const [edit, setEdit] = useState<{ id: string; displayName: string; bio: string } | null>(null);

  const deleteUser = async (target: { id: string; username: string }) => {
    if (savingRef.current || user?.role !== 'ADMIN' || target.id === user.id) return;
    const confirmation = window.prompt(`Permanently delete ${target.username}? Personal data will be removed and match history anonymized. This cannot be undone. Type the username to confirm:`);
    if (confirmation !== target.username) return;
    savingRef.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ confirmation: 'DELETE USER' }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || `Delete failed (${res.status})`);
      setUsers(current => current.filter(item => item.id !== target.id));
      setEdit(null); setMessage('User and personal data permanently deleted. This cannot be undone.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Delete failed'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const saveManagedUser = async (creating: boolean) => {
    if (savingRef.current || user?.role !== 'ADMIN' || (!creating && !edit)) return;
    savingRef.current = true;
    setSaving(true); setError(''); setMessage('');
    const payload = creating ? newUser : { displayName: edit!.displayName, bio: edit!.bio };
    try {
      const res = await fetch(creating ? '/api/admin/users' : `/api/admin/users/${encodeURIComponent(edit!.id)}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(Array.isArray(result.message) ? result.message.join('; ') : result.message || `Request failed (${res.status})`);
      if (creating) setNewUser({ email: '', username: '', displayName: '', password: '' });
      else setEdit(null);
      setMessage(creating ? 'User created with USER role.' : 'Profile updated.');
      await fetchUsers();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save user');
    } finally {
      // Never retain a submitted plaintext password in the form after a request.
      if (creating) setNewUser(current => ({ ...current, password: '' }));
      savingRef.current = false; setSaving(false);
    }
  };

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
    } catch {
      setError('Could not update the user role.');
    }
  };

  const handleBan = async (userId: string) => {
    const days = prompt('Enter BAN duration (in days):', '7');
    if (days === null) return;
    const durationDays = parseBoundedInteger(days, 1, 3650);
    if (durationDays === null) {
      setError('BAN duration must be a whole number from 1 to 3650 days.');
      return;
    }
    const reason = prompt('Enter BAN reason:', 'Violation of terms');
    if (reason === null) return;
    const normalizedReason = reason.trim();
    const reasonError = validateLength(normalizedReason, 'BAN reason', 1, 500);
    if (reasonError) {
      setError(reasonError);
      return;
    }
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ durationDays, reason: normalizedReason })
      });
      if (res.ok) {
        alert('User has been banned.');
        fetchUsers();
      } else {
        alert('Failed to ban user.');
      }
    } catch {
      setError('Could not ban the user.');
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
    } catch {
      setError('Could not unban the user.');
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

      {error && <div role="alert" style={{ color: 'red', marginBottom: '20px' }}>{error}</div>}
      {message && <p role="status">{message}</p>}

      {user?.role === 'ADMIN' && <section className="arcade-panel" style={{ width: '100%', maxWidth: 1000, margin: '0 auto 24px' }}>
        <h2>CREATE USER</h2>
        <form onSubmit={event => { event.preventDefault(); void saveManagedUser(true); }}>
          <fieldset disabled={saving} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <label>Email <input required type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></label>
            <label>Username <input required minLength={3} maxLength={20} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} /></label>
            <label>Display name <input required maxLength={50} value={newUser.displayName} onChange={e => setNewUser({ ...newUser, displayName: e.target.value })} /></label>
            <label>Password <input required type="password" autoComplete="new-password" minLength={8} maxLength={100} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></label>
            <button type="submit">{saving ? 'SAVING…' : 'CREATE USER'}</button>
          </fieldset>
        </form>
      </section>}

      {edit && user?.role === 'ADMIN' && <section className="arcade-panel" style={{ width: '100%', maxWidth: 1000, margin: '0 auto 24px' }}>
        <h2>EDIT PROFILE</h2>
        <form onSubmit={event => { event.preventDefault(); void saveManagedUser(false); }}>
          <fieldset disabled={saving}>
            <label>Display name <input required maxLength={50} value={edit.displayName} onChange={e => setEdit({ ...edit, displayName: e.target.value })} /></label>
            <label>Bio <textarea maxLength={200} value={edit.bio} onChange={e => setEdit({ ...edit, bio: e.target.value })} /></label>
            <button type="submit">SAVE PROFILE</button>
            <button type="button" onClick={() => setEdit(null)}>CANCEL</button>
          </fieldset>
        </form>
      </section>}

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
              {user?.role === 'ADMIN' && u.id !== user.id && <button disabled={saving} onClick={() => setEdit({ id: u.id, displayName: u.displayName, bio: u.bio ?? '' })}>EDIT PROFILE</button>}
              {user?.role === 'ADMIN' && u.id !== user.id && <button disabled={saving} onClick={() => void deleteUser(u)}>PERMANENTLY DELETE</button>}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#888' }}>ROLE:</span>
                  <select 
                      value={u.role} 
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={user?.role !== 'ADMIN' || u.id === user.id || saving}
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
