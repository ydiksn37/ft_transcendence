import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { RecentBattles } from "@/components/dashboard/RecentBattles"
import type { UserStats, GameRecordView } from "@/lib/types"
import { useConfig } from '../hooks/useConfig'
import { TETROMINOS } from '../utils/tetrominos'
import { AVATAR_PRESETS, getAvatarPreset } from "@/lib/avatarPresets"
import { AvatarIcon } from "@/components/UI/AvatarIcon"
import '../pages/Dashboard.css'
import '../pages/JoinPage.css'
import './LobbyPage.css' // Reuse back-btn

export default function Profile() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();
	const [stats, setStats] = useState<UserStats | null>(null);
	const [games, setGames] = useState<GameRecordView[]>([]);
	const [user, setUser] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [loadingPiece, setLoadingPiece] = useState<any>(null);

	useEffect(() => {
		const pieces = 'IJLOSTZ';
		const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
		setLoadingPiece(TETROMINOS[randomPiece as keyof typeof TETROMINOS]);
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu) {
				navigate(mode ? `/lobby/${mode}` : '/menu');
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu]);

	useEffect(() => {
		const token = localStorage.getItem('token');
		if (!token) {
			navigate('/login');
			return;
		}

		async function fetchData() {
			try {
				const headers = { Authorization: `Bearer ${token}` };

				const meRes = await fetch('/api/users/me', { headers });
				if (!meRes.ok) throw new Error('Failed to fetch user');
				const me = await meRes.json();
				setUser(me);

				const statsRes = await fetch('/api/users/me/stats', { headers });
				if (!statsRes.ok) throw new Error('Failed to fetch stats');
				const statsData = await statsRes.json();

				const historyRes = await fetch('/api/users/me/history', { headers });
				if (!historyRes.ok) throw new Error('Failed to fetch history');
				const historyData = await historyRes.json();

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
				console.error(error);
			} finally {
				setTimeout(() => {
					setLoading(false);
				}, 1000);
			}
		}

		fetchData();
	}, [navigate]);

	if (loading || !user || !stats) {
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

	const preset = getAvatarPreset(user.avatarId || 0);

	return (
		<div className="dashboard-container">
			<div className="dashboard-header">
				<button className="back-btn" onClick={() => navigate(mode ? `/lobby/${mode}` : '/menu')}>
					◀ BACK TO LOBBY
				</button>
			</div>

			<div className="dashboard-content">
				<h1 className="dashboard-title">MY PROFILE</h1>
				<div className="dashboard-subtitle">@{user.username}</div>

				<div className="dashboard-panels">
					<div style={{ display: 'flex', gap: '30px', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
						
						{/* プロフィール情報 */}
						<div className="arcade-panel" style={{ flex: '1 1 300px', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
							<AvatarIcon color={preset.color} symbol={preset.symbol} photo={user.avatarUrl} size={96} />
							<div style={{ textAlign: 'center' }}>
								<div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.displayName || user.username}</div>
								<div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>@{user.username}</div>
							</div>
							<div style={{ width: '100%', borderTop: '2px solid #444', paddingTop: '15px', marginTop: '10px' }}>
								<div style={{ fontSize: '10px', color: '#888', marginBottom: '10px' }}>BIO</div>
								<div style={{ fontSize: '12px', lineHeight: '1.5', color: '#ccc' }}>
									{user.bio || "No bio set."}
								</div>
							</div>
						</div>

						{/* スタッツ */}
						<div className="arcade-panel" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
							<div style={{ fontSize: '14px', color: 'white', borderBottom: '4px solid #444', paddingBottom: '10px' }}>STATS</div>
							{[
								{ label: "GAMES", value: stats.totalGames, color: "#00f5ff" },
								{ label: "WINS", value: stats.wins, color: "#4caf50" },
								{ label: "LOSSES", value: stats.losses, color: "#f44336" },
								{ label: "WIN RATE", value: `${stats.winRate}%`, color: "#ff00aa" },
								{ label: "BEST APM", value: stats.bestApm, color: "#bf00ff" },
								{ label: "BEST STREAK", value: stats.bestWinStreak, color: "#00f5ff" },
							].map(s => (
								<div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #222', paddingBottom: '10px' }}>
									<span style={{ fontSize: '12px', color: '#aaa' }}>{s.label}</span>
									<span style={{ fontSize: '14px', color: s.color, fontWeight: 'bold' }}>{s.value}</span>
								</div>
							))}
						</div>

						{/* アバターピッカー */}
						<div className="arcade-panel" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
							<div style={{ fontSize: '14px', color: 'white', borderBottom: '4px solid #444', paddingBottom: '10px' }}>AVATAR</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
								{AVATAR_PRESETS.map((p, i) => {
									const selected = (user.avatarId || 0) === i;
									return (
										<div key={i} style={{ 
											display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
											padding: '10px', backgroundColor: selected ? 'rgba(255,255,255,0.1)' : '#111',
											border: `2px solid ${selected ? p.color : '#333'}`,
											cursor: 'pointer'
										}}>
											<AvatarIcon color={p.color} symbol={p.symbol} size={32} />
										</div>
									)
								})}
							</div>
						</div>

					</div>

					<RecentBattles games={games} />
				</div>
			</div>
		</div>
	)
}