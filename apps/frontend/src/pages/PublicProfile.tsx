import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AvatarIcon } from '@/components/UI/AvatarIcon';
import { RecentBattles } from '@/components/dashboard/RecentBattles';
import { getAvatarPreset } from '@/lib/avatarPresets';
import { loadPublicProfile, profileRequest, ProfileRequestError } from '@/lib/publicProfile';
import './Dashboard.css';

export default function PublicProfile() {
  const { id = '' } = useParams();
  return <ProfileDetails key={id} id={id} />;
}

function ProfileDetails({ id }: { id: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPublicProfile>> | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login', { replace: true }); return; }
    setError('');
    loadPublicProfile(id, token, request.signal).then(result => {
      if (!request.signal.aborted) setData(result);
    }).catch((failure: unknown) => {
      if (request.signal.aborted) return;
      setData(null);
      if (failure instanceof ProfileRequestError && failure.status === 401)
        navigate('/login', { replace: true });
      else setError(failure instanceof Error ? failure.message : 'Unable to load profile.');
    });
    return () => request.abort();
  }, [id, navigate, revision]);

  const act = async (path: string, method: string, body?: object) => {
    const signal = controller.current?.signal;
    const token = localStorage.getItem('token');
    if (!signal || signal.aborted || busy) return;
    if (!token) { navigate('/login'); return; }
    setBusy(true);
    setActionError('');
    try {
      await profileRequest(path, token, signal, { method, body: body ? JSON.stringify(body) : undefined });
      if (!signal.aborted) setRevision(value => value + 1);
    } catch (failure) {
      if (!signal.aborted) setActionError(failure instanceof Error ? failure.message : 'Request failed.');
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const user = data?.user;
  const preset = getAvatarPreset(user?.avatarUrl?.startsWith('preset:')
    ? Number(user.avatarUrl.slice(7)) : 0);
  const friend = data?.friendship;
  return <main className="dashboard-container">
    <div className="dashboard-header"><Link className="back-btn" to="/search">◀ BACK TO SEARCH</Link></div>
    <div className="dashboard-content">
      {error ? <div role="alert" className="arcade-panel">{error}
        <button className="nav-btn" onClick={() => setRevision(value => value + 1)}>RETRY</button>
      </div> : !data || !user ? <p role="status">LOADING...</p> : <>
        <h1 className="dashboard-title">PLAYER PROFILE</h1>
        <section className="arcade-panel" style={{ gap: 16 }}>
          <AvatarIcon color={preset.color} symbol={preset.symbol} size={96}
            photo={user.avatarUrl?.startsWith('preset:') ? undefined : user.avatarUrl ?? undefined} />
          <h2>{user.displayName || user.username}</h2>
          <p>@{user.username}</p>
          <p aria-label="Online status">{user.isOnline ? 'ONLINE' : 'OFFLINE'}</p>
          <p>{user.bio || 'No bio set.'}</p>
          {data.me.id === user.id ? <Link to="/profile">EDIT MY PROFILE</Link> :
            <div aria-label="Friend actions">
              {!friend || friend.status === 'REJECTED' ?
                <button disabled={busy} onClick={() => act('friends/request', 'POST', { addresseeId: user.id })}>ADD FRIEND</button> :
                friend.status === 'ACCEPTED' ? <>
                  <span>FRIENDS </span>
                  <button disabled={busy} onClick={() => act(`friends/${user.id}`, 'DELETE')}>REMOVE FRIEND</button>
                </> : friend.addresseeId === data.me.id ? <>
                  <button disabled={busy} onClick={() => act(`friends/${friend.id}`, 'PATCH', { accept: true })}>ACCEPT</button>
                  <button disabled={busy} onClick={() => act(`friends/${friend.id}`, 'PATCH', { accept: false })}>DECLINE</button>
                </> : <>
                  <span>REQUEST PENDING </span>
                  <button disabled={busy} onClick={() => act(`friends/${user.id}`, 'DELETE')}>CANCEL REQUEST</button>
                </>}
            </div>}
          {actionError && <p role="alert">{actionError}</p>}
        </section>
        <section className="arcade-panel" aria-label="Player statistics">
          <h2>STATS</h2>
          {user.stats ? <dl>
            <dt>GAMES</dt><dd>{user.stats.totalGames}</dd>
            <dt>WINS / LOSSES</dt><dd>{user.stats.wins} / {user.stats.losses}</dd>
            <dt>WIN RATE</dt><dd>{Number(user.stats.winRate).toFixed(1)}%</dd>
            <dt>BEST APM / PPS</dt><dd>{Number(user.stats.bestApm).toFixed(1)} / {Number(user.stats.bestPps).toFixed(2)}</dd>
          </dl> : <p>No statistics yet.</p>}
        </section>
        <RecentBattles games={data.games} />
      </>}
    </div>
  </main>;
}
