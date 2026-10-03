import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AvatarIcon } from '@/components/UI/AvatarIcon';
import { getAvatarPreset } from '@/lib/avatarPresets';
import '../pages/Dashboard.css';

interface UserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  role: string;
  stats?: {
    rank: string;
    rankPoints: number;
    winRate: number;
    totalGames: number;
  };
}

export default function AdvancedSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof requestedReturnTo === 'string' && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo : '/profile?tab=overview';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [sortBy, setSortBy] = useState<'RANK_POINTS_DESC' | 'WIN_RATE_DESC' | 'WIN_RATE_ASC' | 'GAMES_DESC'>('RANK_POINTS_DESC');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<UserResult[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const fetchResults = async () => {
      setLoading(true);
      setError(false);
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '10',
          status,
          sortBy
        });
        if (submittedQuery) params.append('q', submittedQuery);

        const res = await fetch(`/api/users/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }, signal,
        });
        if (!res.ok) throw new Error('Search unavailable');
        {
          const data = await res.json();
          if (signal.aborted) return;
          setResults(data.data);
          setTotalPages(data.totalPages);
        }
      } catch {
        if (!signal.aborted) setError(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };
    void fetchResults();
    return () => controller.abort();
  }, [status, sortBy, page, submittedQuery, revision]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedQuery(query.trim());
    setRevision(value => value + 1);
  };

  const handleUserClick = (id: string) => {
    navigate(`/profile/${id}`, { state: { searchReturnTo: returnTo } });
  };

  const inputStyle = {
    padding: '10px',
    backgroundColor: '#000',
    color: '#fff',
    border: '2px solid #333',
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '12px'
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <button className="back-btn" onClick={() => navigate(returnTo, { replace: true })}>
          ◀ BACK
        </button>
      </div>

      <div className="dashboard-content">
        <h1 className="dashboard-title" style={{ color: '#9b59b6' }}>ADVANCED SEARCH</h1>

        <div className="arcade-panel" style={{ marginBottom: '20px' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              maxLength={100}
              placeholder="SEARCH USERNAME..."
              style={{ ...inputStyle, flex: '1 1 200px' }}
            />
            
            <select value={status} onChange={e => { setStatus(e.target.value as any); setPage(1); }} style={inputStyle}>
              <option value="ALL">ALL STATUS</option>
              <option value="ONLINE">ONLINE ONLY</option>
              <option value="OFFLINE">OFFLINE ONLY</option>
            </select>

            <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); setPage(1); }} style={inputStyle}>
              <option value="RANK_POINTS_DESC">HIGHEST RANK POINTS</option>
              <option value="WIN_RATE_DESC">HIGHEST WIN RATE</option>
              <option value="WIN_RATE_ASC">LOWEST WIN RATE</option>
              <option value="GAMES_DESC">MOST GAMES PLAYED</option>
            </select>

            <button type="submit" style={{ ...inputStyle, backgroundColor: '#3498db', color: 'white', borderColor: '#3498db', cursor: 'pointer' }}>
              SEARCH
            </button>
          </form>
        </div>

        <div className="arcade-panel" style={{ minHeight: '400px' }}>
          {error ? <p role="alert">Could not load players. <button onClick={() => setRevision(value => value + 1)}>RETRY</button></p> : loading ? (
            <div style={{ textAlign: 'center', padding: '50px', color: '#888' }}>LOADING...</div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px', color: '#888' }}>NO USERS FOUND</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {results.map((u, index) => {
                const preset = getAvatarPreset(u.id?.charCodeAt(0) % 8 || 0);
                const winRate = u.stats?.winRate ? Number(u.stats.winRate).toFixed(1) : '0.0';
                
                return (
                  <div key={u.id} className="friend-item" onClick={() => handleUserClick(u.id)} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#1a1a1a', border: '2px solid #333', cursor: 'pointer' }}>
                    <div style={{ fontSize: '14px', color: '#555', width: '30px' }}>
                      #{((page - 1) * 10) + index + 1}
                    </div>
                    <AvatarIcon color={preset.color} symbol={preset.symbol} photo={u.avatarUrl} size={48} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{u.displayName || u.username}</div>
                      <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>@{u.username}</div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '30px', textAlign: 'right' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#888' }}>{u.stats?.rank ?? 'UNRANKED'}</div>
                        <div style={{ fontSize: '14px', color: '#00f5ff', marginTop: '5px' }}>{u.stats?.rankPoints ?? 0} RP</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#888' }}>WIN RATE</div>
                        <div style={{ fontSize: '14px', color: '#f1c40f', marginTop: '5px' }}>{winRate}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#888' }}>GAMES</div>
                        <div style={{ fontSize: '14px', color: '#3498db', marginTop: '5px' }}>{u.stats?.totalGames || 0}</div>
                      </div>
                      <div style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', backgroundColor: u.isOnline ? '#4caf50' : '#555', borderRadius: '50%', boxShadow: u.isOnline ? '0 0 10px #4caf50' : 'none' }} />
                        <span style={{ fontSize: '10px', color: u.isOnline ? '#4caf50' : '#888' }}>{u.isOnline ? 'ON' : 'OFF'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...inputStyle, opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
            >
              ◀ PREV
            </button>
            <span style={{ color: '#fff', fontSize: '12px', alignSelf: 'center' }}>
              PAGE {page} OF {totalPages}
            </span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ ...inputStyle, opacity: page === totalPages ? 0.5 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
            >
              NEXT ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
