import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { StatCard } from "@/components/dashboard/StatCard"
import { WinRatePanel } from "@/components/dashboard/WinRatePanel"
import { RecentBattles } from "@/components/dashboard/RecentBattles"
import { TrendChart } from "@/components/dashboard/TrendChart"
import { DataExportButtons } from "@/components/dashboard/DataExportButtons"
import type { UserStats, GameRecordView } from "@/lib/types"
import { TETROMINOS } from '../utils/tetrominos'
import { useConfig } from '../hooks/useConfig'
import { startVisibleRefresh } from '../lib/visibleRefresh'
import { io } from 'socket.io-client'
import './Dashboard.css'
import '../pages/JoinPage.css'
import './LobbyPage.css' // Reuse back-btn

export default function Dashboard() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();
	const [stats, setStats] = useState<UserStats | null>(null);
	const [username, setUsername] = useState<string>("");
	const [games, setGames] = useState<GameRecordView[]>([]);
	const [historyMode, setHistoryMode] = useState<'ALL' | 'VERSUS' | 'AI' | 'TOURNAMENT' | 'LINES_40' | 'MARATHON'>('ALL');
	const [historyResult, setHistoryResult] = useState<'ALL' | 'WIN' | 'LOSE'>('ALL');
	const [loading, setLoading] = useState(true);
	const [fromDate, setFromDate] = useState('');
	const [toDate, setToDate] = useState('');
	const [error, setError] = useState(false);
	const [loadingPiece, setLoadingPiece] = useState<any>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu) {
				navigate(mode ? `/lobby/${mode}` : '/menu');
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu, mode]);

	useEffect(() => {
		const pieces = 'IJLOSTZ';
		const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
		setLoadingPiece(TETROMINOS[randomPiece as keyof typeof TETROMINOS]);
	}, []);

	useEffect(() => {
		const token = localStorage.getItem('token');
		if (!token) {
			navigate('/login');
			return;
		}

		const controller = new AbortController();
		const signal = controller.signal;
		async function fetchData() {
			setError(false);
			try {
				const headers = { Authorization: `Bearer ${token}` };

				// Fetch current user to get ID for calculating game results
				const meRes = await fetch('/api/users/me', { headers, signal });
				if (!meRes.ok) throw new Error('Failed to fetch user');
				const me = await meRes.json();
				if (signal.aborted) return;
				setUsername(me.username);

				// Fetch stats
				const statsRes = await fetch('/api/users/me/stats', { headers, signal });
				if (!statsRes.ok) throw new Error('Failed to fetch stats');
				const statsData = await statsRes.json();

				// Fetch history
				const params = new URLSearchParams({ mode: historyMode, result: historyResult, limit: '50' });
				if (fromDate) params.set('from', fromDate);
				if (toDate) params.set('to', toDate);
				const historyRes = await fetch(`/api/users/me/history?${params}`, { headers, signal });
				if (!historyRes.ok) throw new Error('Failed to fetch history');
				const historyData = await historyRes.json();
				if (signal.aborted) return;

				// Map history to GameRecordView
				const mappedGames: GameRecordView[] = historyData.data.map((g: any) => {
					const isP1 = g.player1Id === me.id;
					return {
						id: g.id,
						date: new Date(g.createdAt).toISOString().split('T')[0],
						mode: g.gameMode,
						apm: isP1 ? Number(g.player1Apm) : Number(g.player2Apm),
						pps: isP1 ? Number(g.player1Pps) : Number(g.player2Pps),
						lines: isP1 ? g.player1LinesCleared : g.player2LinesCleared,
						result: g.winnerId === me.id ? "WIN" : (g.winnerId ? "LOSE" : null)
					};
				});

				setStats({
					...statsData,
					bestApm: Number(statsData.bestApm),
					avgApm: Number(statsData.avgApm),
					bestPps: Number(statsData.bestPps),
					avgPps: Number(statsData.avgPps),
					winRate: Number(statsData.winRate),
				});
				setGames(mappedGames);
			} catch (error) {
				if (signal.aborted) return;
				console.error(error);
				setError(true);
				setGames([]);
				// Optionally handle error, e.g. navigate to login if unauthorized
			} finally {
				if (!signal.aborted) setLoading(false);
			}
		}

		const stopRefresh = startVisibleRefresh(fetchData);
		const socket = io(import.meta.env.VITE_WS_URL || window.location.origin, {
			transports: ['websocket'],
			auth: { token },
		});
		const handleAnalyticsUpdate = () => {
			if (document.visibilityState === 'visible') void fetchData();
		};
		socket.on('analytics:updated', handleAnalyticsUpdate);
		return () => {
			stopRefresh();
			controller.abort();
			socket.off('analytics:updated', handleAnalyticsUpdate);
			socket.disconnect();
		};
	}, [navigate, historyMode, historyResult, fromDate, toDate]);

	if (loading) {
		return (
			<div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
				<div className="loading-content">
					<div className="tetris-spinner" style={{ 
							width: loadingPiece ? loadingPiece.shape[0].length * 20 : 60, 
							height: loadingPiece ? loadingPiece.shape.length * 20 : 60 
						}}>
						{loadingPiece && loadingPiece.shape.map((row: any[], y: number) => 
							row.map((cell: any, x: number) => {
								if (cell !== 0) {
									return (
										<div 
											key={`${y}-${x}`} 
											style={{ 
												position: 'absolute', 
												top: y * 20, 
												left: x * 20, 
												width: 20, 
												height: 20, 
												backgroundColor: loadingPiece.color, 
												boxShadow: 'inset 0 0 0 2px #111' 
											}} 
										/>
									);
								}
								return null;
							})
						)}
					</div>
					<div className="loading-text">LOADING...</div>
				</div>
			</div>
		)
	}

	return (
		<div className="dashboard-container">
			<div className="dashboard-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
				<button className="back-btn" onClick={() => navigate(mode ? `/lobby/${mode}` : '/menu')}>
					◀ BACK
				</button>
				{stats && <DataExportButtons stats={stats} games={games} username={username} />}
			</div>

			<div className="dashboard-content">
				<h1 className="dashboard-title">DASHBOARD</h1>
				<p>Updates every 15 seconds while this tab is visible.</p>

				<div className="dashboard-panels">
					{stats && (
						<>
							{/* 統計カード */}
							<div className="dashboard-grid">
								<StatCard label="Battles" value={stats.totalGames} />
								<StatCard label="Best APM" value={stats.bestApm} />
								<StatCard label="Best Streak" value={stats.bestWinStreak} />
								<StatCard label="Wins" value={stats.wins} sub={`${stats.losses} losses`} />
							</div>
							
							{/* 勝率パネル */}
							<WinRatePanel stats={stats} />		
						</>
					)}

					{/* ソーシャルボタン */}
					<div style={{ display: 'flex', gap: '20px', width: '100%', justifyContent: 'center', marginTop: '10px', marginBottom: '10px' }}>
						<button 
							onClick={() => navigate(`/chat?mode=${mode || ''}`)}
							style={{ padding: '15px 30px', fontSize: '14px', backgroundColor: '#e91e63', color: 'white', border: '4px solid #444', cursor: 'pointer', flex: 1, fontFamily: "'Press Start 2P', monospace", boxShadow: '4px 4px 0px rgba(0,0,0,1)', transition: 'transform 0.1s' }}
							onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
							onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
							onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
						>
							💬 GLOBAL CHAT
						</button>
						<button 
							onClick={() => navigate(`/friends?mode=${mode || ''}`)}
							style={{ padding: '15px 30px', fontSize: '14px', backgroundColor: '#3498db', color: 'white', border: '4px solid #444', cursor: 'pointer', flex: 1, fontFamily: "'Press Start 2P', monospace", boxShadow: '4px 4px 0px rgba(0,0,0,1)', transition: 'transform 0.1s' }}
							onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
							onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
							onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
						>
							👥 FRIENDS LIST
						</button>
						<button 
							onClick={() => navigate('/search')}
							style={{ padding: '15px 30px', fontSize: '14px', backgroundColor: '#9b59b6', color: 'white', border: '4px solid #444', cursor: 'pointer', flex: 1, fontFamily: "'Press Start 2P', monospace", boxShadow: '4px 4px 0px rgba(0,0,0,1)', transition: 'transform 0.1s' }}
							onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
							onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
							onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
						>
							🔍 SEARCH USERS
						</button>
					</div>

					{/* History Filters */}
					<p>History and trends: latest 50 matching games. Dates use UTC. Summary cards show lifetime statistics.</p>
					<div style={{ display: 'flex', gap: 16 }}>
						<label>FROM <input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} /></label>
						<label>TO <input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} /></label>
					</div>
					{error && <p role="alert">Could not load dashboard data. Check the date range and try again.</p>}
					<div style={{ display: 'flex', gap: '20px', width: '100%', justifyContent: 'flex-start', marginBottom: '10px' }}>
						<select 
							value={historyMode} 
							onChange={e => setHistoryMode(e.target.value as any)}
							style={{ padding: '10px', backgroundColor: '#000', color: '#fff', border: '2px solid #333', fontFamily: "'Press Start 2P', monospace", fontSize: '10px' }}
						>
							<option value="ALL">ALL MODES</option>
							<option value="VERSUS">VERSUS</option>
							<option value="AI">AI</option>
							<option value="TOURNAMENT">TOURNAMENT</option>
							<option value="LINES_40">40 LINES</option>
							<option value="MARATHON">MARATHON</option>
						</select>
						<select 
							value={historyResult} 
							onChange={e => setHistoryResult(e.target.value as any)}
							style={{ padding: '10px', backgroundColor: '#000', color: '#fff', border: '2px solid #333', fontFamily: "'Press Start 2P', monospace", fontSize: '10px' }}
						>
							<option value="ALL">ALL RESULTS</option>
							<option value="WIN">WINS</option>
							<option value="LOSE">LOSSES</option>
						</select>
					</div>

					{/* Trend Chart */}
					<TrendChart games={games} />

					{/* Recent Battles */}
					<RecentBattles games={games} />
				</div>
			</div>
		</div>
	)
}
