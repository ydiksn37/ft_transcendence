import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { io } from 'socket.io-client';
import { AchievementProgression, ProgressionSummary, type ProgressionData } from '@/components/dashboard/Progression';
import { DataExportButtons } from '@/components/dashboard/DataExportButtons';
import { RecentBattles } from '@/components/dashboard/RecentBattles';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { WinRatePanel } from '@/components/dashboard/WinRatePanel';
import { AvatarIcon } from '@/components/UI/AvatarIcon';
import { DsAlert, DsButton, DsInput, DsSelect, DsSpinner } from '@/components/design-system';
import { useConfig } from '@/hooks/useConfig';
import { AVATAR_PRESETS, resolveAvatar } from '@/lib/avatarPresets';
import { getProfileTab, mapAnalytics, mapGameHistory, normalizeStats, PROFILE_TABS, profileSearch, type ProfileTab } from '@/lib/profileHub';
import type { DailyAnalyticView, GameRecordView, UserStats } from '@/lib/types';
import { startVisibleRefresh } from '@/lib/visibleRefresh';
import { getCroppedImg } from '@/utils/cropImage';
import './Dashboard.css';
import './Profile.css';
import './LobbyPage.css';

type ProfileUser = {
  id: string; username: string; displayName: string | null; bio: string | null;
  avatarUrl: string | null; role?: string;
};
type HistoryMode = 'ALL' | 'VERSUS' | 'AI' | 'TOURNAMENT' | 'LINES_40' | 'MARATHON';
type HistoryResult = 'ALL' | 'WIN' | 'LOSE';

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { keyConfig } = useConfig();
  const tab = getProfileTab(location.search);
  const mode = new URLSearchParams(location.search).get('mode');
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [progression, setProgression] = useState<ProgressionData | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState('');
  const [coreAttempt, setCoreAttempt] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [games, setGames] = useState<GameRecordView[]>([]);
  const [analytics, setAnalytics] = useState<DailyAnalyticView[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState('');
  const [historyMode, setHistoryMode] = useState<HistoryMode>('ALL');
  const [historyResult, setHistoryResult] = useState<HistoryResult>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const goBack = useCallback(() => navigate(mode ? `/lobby/${mode}` : '/menu'), [mode, navigate]);
  const withMode = useCallback((path: string) => mode ? `${path}?mode=${encodeURIComponent(mode)}` : path, [mode]);

  useEffect(() => {
    const raw = new URLSearchParams(location.search).get('tab');
    if (raw !== tab) {
      navigate({ pathname: '/profile', search: profileSearch(location.search, 'overview') }, { replace: true });
    }
  }, [location.search, navigate, tab]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const controller = new AbortController();
    const fetchCore = async () => {
      setCoreError('');
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [meRes, statsRes, progressionRes] = await Promise.all([
          fetch('/api/users/me', { headers, signal: controller.signal }),
          fetch('/api/users/me/stats', { headers, signal: controller.signal }),
          fetch('/api/users/me/progression', { headers, signal: controller.signal }),
        ]);
        if (!meRes.ok || !statsRes.ok || !progressionRes.ok) throw new Error('Profile unavailable');
        const [me, statsData, progressionData] = await Promise.all([meRes.json(), statsRes.json(), progressionRes.json()]);
        if (controller.signal.aborted) return;
        setUser(me); setStats(normalizeStats(statsData)); setProgression(progressionData);
        setRefreshVersion(value => value + 1);
      } catch (error) {
        if (!controller.signal.aborted) setCoreError(error instanceof Error ? error.message : 'Could not load your profile.');
      } finally {
        if (!controller.signal.aborted) setCoreLoading(false);
      }
    };
    const stopRefresh = startVisibleRefresh(fetchCore);
    const socket = io(import.meta.env.VITE_WS_URL || window.location.origin, { transports: ['websocket'], auth: { token } });
    const handleUpdate = () => { if (document.visibilityState === 'visible') void fetchCore(); };
    socket.on('analytics:updated', handleUpdate);
    return () => { stopRefresh(); controller.abort(); socket.off('analytics:updated', handleUpdate); socket.disconnect(); };
  }, [coreAttempt, navigate]);

  useEffect(() => {
    if (tab !== 'performance' || !user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const controller = new AbortController();
    const loadHistory = async () => {
      setPerformanceLoading(true); setPerformanceError('');
      try {
        const params = new URLSearchParams({ mode: historyMode, result: historyResult, limit: '50' });
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        const response = await fetch(`/api/users/me/history?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('History unavailable');
        const body = await response.json();
        if (!controller.signal.aborted) setGames(mapGameHistory(body.data, user.id));
      } catch {
        if (!controller.signal.aborted) setPerformanceError('Could not load matching history. Check the date range and retry.');
      } finally { if (!controller.signal.aborted) setPerformanceLoading(false); }
    };
    void loadHistory();
    return () => controller.abort();
  }, [tab, user, historyMode, historyResult, fromDate, toDate, refreshVersion]);

  useEffect(() => {
    if (tab !== 'performance') return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/users/me/analytics?days=30', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(body => { if (!controller.signal.aborted) setAnalytics(mapAnalytics(body)); })
      .catch(() => { if (!controller.signal.aborted) setPerformanceError('Could not load performance analytics.'); });
    return () => controller.abort();
  }, [tab, refreshVersion]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (editOpen) {
        if (event.key === 'Escape') {
          if (imageSrc) setImageSrc(null);
          else setEditOpen(false);
        }
        return;
      }
      if (event.code === keyConfig.quitToMenu) goBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editOpen, goBack, imageSrc, keyConfig.quitToMenu]);

  const selectTab = (next: ProfileTab) => navigate({ pathname: '/profile', search: profileSearch(location.search, next) });
  const handleTabKey = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % PROFILE_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + PROFILE_TABS.length) % PROFILE_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = PROFILE_TABS.length - 1;
    else return;
    event.preventDefault(); selectTab(PROFILE_TABS[next]);
    requestAnimationFrame(() => tabRefs.current[next]?.focus());
  };

  const openEditor = () => {
    if (!user) return;
    setEditName(user.displayName || user.username); setEditBio(user.bio || ''); setEditError('');
    setSelectedPreset(user.avatarUrl?.startsWith('preset:') ? Number(user.avatarUrl.split(':')[1]) : null);
    setEditOpen(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    const name = editName.trim();
    if (!name || name.length > 50) { setEditError('Display name must be between 1 and 50 characters.'); return; }
    if (editBio.length > 200) { setEditError('Bio must not exceed 200 characters.'); return; }
    setSaving(true); setEditError('');
    try {
      const body: Record<string, string> = { displayName: name, bio: editBio };
      if (selectedPreset !== null) body.avatarUrl = `preset:${selectedPreset}`;
      const response = await fetch('/api/users/me', { method: 'PATCH', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error((await response.json()).message || 'Could not update profile.');
      setUser(await response.json()); setEditOpen(false);
    } catch (error) { setEditError(error instanceof Error ? error.message : 'Could not update profile.'); }
    finally { setSaving(false); }
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) { setEditError('Avatar must be a JPG, PNG, GIF, or WebP image.'); return; }
    if (file.size > 2 * 1024 * 1024) { setEditError('Avatar must not exceed 2 MB.'); return; }
    const reader = new FileReader(); reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null)); reader.readAsDataURL(file);
  };

  const uploadCroppedImage = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true); setEditError('');
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const form = new FormData(); form.append('avatar', blob, 'avatar.jpg');
      const response = await fetch('/api/users/me/avatar', { method: 'POST', headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}` }, body: form });
      if (!response.ok) throw new Error((await response.json()).message || 'Failed to upload avatar.');
      const meResponse = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (meResponse.ok) setUser(await meResponse.json());
      setSelectedPreset(null); setImageSrc(null);
    } catch (error) { setEditError(error instanceof Error ? error.message : 'Failed to upload avatar.'); }
    finally { setSaving(false); }
  };

  if (coreLoading) return <div className="dashboard-container profile-centered"><DsSpinner label="Loading profile" /></div>;
  if (!user || !stats || !progression) return <div className="dashboard-container profile-centered">
    <DsAlert tone="danger">{coreError || 'Could not load your profile.'}</DsAlert>
    <DsButton onClick={() => { setCoreLoading(true); setCoreAttempt(value => value + 1); }}>RETRY</DsButton>
  </div>;

  const avatar = resolveAvatar(user.id, user.avatarUrl);

  return <div className="dashboard-container profile-hub">
    <header className="dashboard-header profile-header">
      <DsButton className="back-btn" onClick={goBack}>◀ BACK</DsButton>
      {(user.role === 'ADMIN' || user.role === 'MODERATOR') && <DsButton onClick={() => navigate(withMode('/admin'))}>ADMIN PANEL</DsButton>}
    </header>
    <main className="dashboard-content">
      <h1 className="dashboard-title">PROFILE</h1>
      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {PROFILE_TABS.map((item, index) => <button key={item} ref={element => { tabRefs.current[index] = element; }}
          id={`profile-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls={`profile-panel-${item}`}
          tabIndex={tab === item ? 0 : -1} onClick={() => selectTab(item)} onKeyDown={event => handleTabKey(event, index)}>
          {item.toUpperCase()}
        </button>)}
      </div>
      {coreError && <DsAlert tone="danger">Profile refresh failed. Showing the last available data.</DsAlert>}

      {tab === 'overview' && <section id="profile-panel-overview" role="tabpanel" aria-labelledby="profile-tab-overview" className="profile-tab-panel">
        <div className="profile-hero arcade-panel">
          <AvatarIcon color={avatar.preset.color} symbol={avatar.preset.symbol} photo={avatar.photo} size={96} />
          <div className="profile-identity"><h2>{user.displayName || user.username}</h2><span>@{user.username}</span><p>{user.bio || 'No bio set.'}</p></div>
          <DsButton onClick={openEditor}>EDIT PROFILE</DsButton>
        </div>
        <ProgressionSummary data={progression} />
        <div className="dashboard-grid profile-stat-grid">
          <StatCard label="BATTLES" value={stats.totalGames} />
          <StatCard label="WINS" value={stats.wins} sub={`${stats.losses} losses`} />
          <StatCard label="BEST APM" value={stats.bestApm} />
          <StatCard label="BEST STREAK" value={stats.bestWinStreak} />
        </div>
        <nav className="profile-quick-actions" aria-label="Profile actions">
          <DsButton onClick={() => navigate(withMode('/settings'))}>SETTINGS</DsButton>
          <DsButton onClick={() => navigate(withMode('/chat'))}>GLOBAL CHAT</DsButton>
          <DsButton onClick={() => navigate(withMode('/friends'))}>FRIENDS</DsButton>
          <DsButton onClick={() => navigate('/search', { state: { returnTo: `${location.pathname}${location.search}` } })}>SEARCH USERS</DsButton>
        </nav>
      </section>}

      {tab === 'performance' && <section id="profile-panel-performance" role="tabpanel" aria-labelledby="profile-tab-performance" className="profile-tab-panel dashboard-panels">
        <div className="performance-toolbar"><p>Updates every 15 seconds while this tab is visible.</p><DataExportButtons stats={stats} games={games} username={user.username} /></div>
        <div className="dashboard-grid"><StatCard label="BATTLES" value={stats.totalGames} /><StatCard label="BEST APM" value={stats.bestApm} />
          <StatCard label="BEST STREAK" value={stats.bestWinStreak} /><StatCard label="WINS" value={stats.wins} sub={`${stats.losses} losses`} /></div>
        <WinRatePanel stats={stats} />
        <div className="profile-filters">
          <label>FROM <DsInput type="date" value={fromDate} max={toDate || undefined} onChange={event => setFromDate(event.target.value)} /></label>
          <label>TO <DsInput type="date" value={toDate} min={fromDate || undefined} onChange={event => setToDate(event.target.value)} /></label>
          <DsSelect aria-label="Game mode" value={historyMode} onChange={event => setHistoryMode(event.target.value as HistoryMode)}>
            <option value="ALL">ALL MODES</option><option value="VERSUS">VERSUS</option><option value="AI">AI</option>
            <option value="TOURNAMENT">TOURNAMENT</option><option value="LINES_40">40 LINES</option><option value="MARATHON">MARATHON</option>
          </DsSelect>
          <DsSelect aria-label="Game result" value={historyResult} onChange={event => setHistoryResult(event.target.value as HistoryResult)}>
            <option value="ALL">ALL RESULTS</option><option value="WIN">WINS</option><option value="LOSE">LOSSES</option>
          </DsSelect>
        </div>
        {performanceError && <DsAlert tone="danger">{performanceError}</DsAlert>}
        {performanceLoading && <DsSpinner label="Loading match history" />}
        <TrendChart games={games} analytics={analytics} />
        <RecentBattles games={games} />
      </section>}

      {tab === 'achievements' && <section id="profile-panel-achievements" role="tabpanel" aria-labelledby="profile-tab-achievements" className="profile-tab-panel">
        <AchievementProgression data={progression} />
      </section>}
    </main>

    {editOpen && <div className="profile-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditOpen(false); }}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
        <div className="profile-modal-heading"><h2 id="profile-edit-title">EDIT PROFILE</h2><button aria-label="Close profile editor" onClick={() => setEditOpen(false)}>×</button></div>
        {editError && <DsAlert tone="danger">{editError}</DsAlert>}
        <label>DISPLAY NAME <DsInput value={editName} maxLength={50} onChange={event => setEditName(event.target.value)} /></label>
        <label>BIO <textarea value={editBio} maxLength={200} rows={4} onChange={event => setEditBio(event.target.value)} /></label>
        <span className="profile-character-count">{editBio.length} / 200</span>
        <label className="profile-upload-button">UPLOAD CUSTOM IMAGE<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleAvatarUpload} /></label>
        <p className="profile-upload-note">Max: 2 MB (JPG / PNG / GIF / WebP)</p>
        <div className="profile-avatar-presets" role="radiogroup" aria-label="Avatar preset">
          {AVATAR_PRESETS.map((item, index) => <button key={index} type="button" role="radio" aria-checked={selectedPreset === index}
            className={selectedPreset === index ? 'is-selected' : ''} style={{ '--avatar-color': item.color } as React.CSSProperties}
            onClick={() => setSelectedPreset(index)}><AvatarIcon color={item.color} symbol={item.symbol} size={36} /></button>)}
        </div>
        <div className="profile-modal-actions"><DsButton onClick={() => setEditOpen(false)}>CANCEL</DsButton><DsButton disabled={saving} onClick={saveProfile}>{saving ? 'SAVING…' : 'SAVE'}</DsButton></div>
      </section>
    </div>}

    {imageSrc && <div className="profile-cropper" role="dialog" aria-modal="true" aria-label="Crop avatar">
      <div className="profile-cropper-stage"><Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} onCropChange={setCrop}
        onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)} onZoomChange={setZoom} /></div>
      <label>ZOOM <input type="range" value={zoom} min={1} max={3} step={0.1} onChange={event => setZoom(Number(event.target.value))} /></label>
      <div className="profile-modal-actions"><DsButton onClick={() => setImageSrc(null)}>CANCEL</DsButton><DsButton disabled={saving} onClick={uploadCroppedImage}>{saving ? 'UPLOADING…' : 'CROP & UPLOAD'}</DsButton></div>
    </div>}
  </div>;
}
