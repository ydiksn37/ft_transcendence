import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AvatarIcon } from '@/components/UI/AvatarIcon';
import { RecentBattles } from '@/components/dashboard/RecentBattles';
import { resolveAvatar } from '@/lib/avatarPresets';
import { loadPublicProfile, profileRequest, ProfileRequestError } from '@/lib/publicProfile';
import './Dashboard.css';
import './PublicProfile.css';

export default function PublicProfile() {
  const { id = '' } = useParams();
  return <ProfileDetails key={id} id={id} />;
}

function ProfileDetails({ id }: { id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = location.state as { returnTo?: unknown; returnLabel?: unknown; returnState?: unknown } | null;
  const requestedReturnTo = navigationState?.returnTo;
  const returnTo = typeof requestedReturnTo === 'string' && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo : '/search';
  const returnLabel = typeof navigationState?.returnLabel === 'string' && ['SEARCH', 'FRIENDS', 'CHAT'].includes(navigationState.returnLabel)
    ? navigationState.returnLabel : 'SEARCH';
  const returnState = navigationState?.returnState && typeof navigationState.returnState === 'object'
    ? navigationState.returnState : undefined;
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
  const avatar = resolveAvatar(user?.id, user?.avatarUrl);
  const friend = data?.friendship;
  return <main className="dashboard-container public-profile-page">
    <div className="dashboard-header"><button className="back-btn" onClick={() => navigate(returnTo, {
      replace: true, state: returnState,
    })}>◀ BACK TO {returnLabel}</button></div>
    <div className="dashboard-content public-profile-content">
      {error ? <div role="alert" className="arcade-panel">{error}
        <button className="nav-btn" onClick={() => setRevision(value => value + 1)}>RETRY</button>
      </div> : !data || !user ? <p role="status">LOADING...</p> : <>
        <h1 className="dashboard-title">PLAYER PROFILE</h1>
        <div className="public-profile-grid">
          <section className="arcade-panel public-profile-card">
            <div className="public-profile-hero">
              <AvatarIcon color={avatar.preset.color} symbol={avatar.preset.symbol} size={112} photo={avatar.photo} />
              <div className="public-profile-identity">
                <h2>{user.displayName || user.username}</h2>
                <p>@{user.username}</p>
                <span className={`public-profile-status ${user.isOnline ? 'is-online' : ''}`} aria-label="Online status">
                  <i />{user.isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>
            <div className="public-profile-bio"><span>BIO</span><p>{user.bio || 'No bio set.'}</p></div>
            <div className="public-profile-actions" aria-label="Friend actions">
              {data.me.id === user.id ? <Link className="public-profile-action" to="/profile?tab=overview">EDIT MY PROFILE</Link> :
                !friend || friend.status === 'REJECTED' ?
                  <button disabled={busy} onClick={() => act('friends/request', 'POST', { addresseeId: user.id })}>ADD FRIEND</button> :
                  friend.status === 'ACCEPTED' ? <><span>✓ FRIENDS</span><button disabled={busy} onClick={() => act(`friends/${user.id}`, 'DELETE')}>REMOVE FRIEND</button></> :
                  friend.addresseeId === data.me.id ? <><button disabled={busy} onClick={() => act(`friends/${friend.id}`, 'PATCH', { accept: true })}>ACCEPT</button>
                    <button disabled={busy} onClick={() => act(`friends/${friend.id}`, 'PATCH', { accept: false })}>DECLINE</button></> :
                    <><span>REQUEST PENDING</span><button disabled={busy} onClick={() => act(`friends/${user.id}`, 'DELETE')}>CANCEL REQUEST</button></>}
            </div>
            {actionError && <p role="alert" className="public-profile-action-error">{actionError}</p>}
          </section>
          <section className="arcade-panel public-profile-stats" aria-label="Player statistics">
            <div className="public-profile-section-heading"><h2>PERFORMANCE</h2><span>{user.stats?.rank ?? 'UNRANKED'}</span></div>
            {user.stats ? <dl>
              <div><dt>GAMES</dt><dd>{user.stats.totalGames}</dd></div>
              <div><dt>WIN RATE</dt><dd>{Number(user.stats.winRate).toFixed(1)}%</dd></div>
              <div><dt>WINS</dt><dd>{user.stats.wins}</dd></div>
              <div><dt>LOSSES</dt><dd>{user.stats.losses}</dd></div>
              <div><dt>BEST APM</dt><dd>{Number(user.stats.bestApm).toFixed(1)}</dd></div>
              <div><dt>BEST PPS</dt><dd>{Number(user.stats.bestPps).toFixed(2)}</dd></div>
              <div><dt>BEST STREAK</dt><dd>{user.stats.bestWinStreak}</dd></div>
              <div><dt>RANK POINTS</dt><dd>{user.stats.rankPoints}</dd></div>
            </dl> : <p className="public-profile-empty">No statistics yet.</p>}
          </section>
          <section className="public-profile-history" aria-label="Recent battles"><RecentBattles games={data.games} /></section>
        </div>
      </>}
    </div>
  </main>;
}
