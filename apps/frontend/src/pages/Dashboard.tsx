import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { StatCard } from "@/components/dashboard/StatCard"
import { WinRatePanel } from "@/components/dashboard/WinRatePanel"
import { RecentBattles } from "@/components/dashboard/RecentBattles"
import type { UserStats, GameRecordView } from "@/lib/types"
import { TETROMINOS } from '../utils/tetrominos'
import './Dashboard.css'
import '../pages/JoinPage.css'
import './LobbyPage.css' // Reuse back-btn

export default function Dashboard() {
	const navigate = useNavigate();
	const [stats, setStats] = useState<UserStats | null>(null);
	const [games, setGames] = useState<GameRecordView[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadingPiece, setLoadingPiece] = useState<any>(null);

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

		async function fetchData() {
			try {
				const headers = { Authorization: `Bearer ${token}` };

				// Fetch current user to get ID for calculating game results
				const meRes = await fetch('/api/users/me', { headers });
				if (!meRes.ok) throw new Error('Failed to fetch user');
				const me = await meRes.json();

				// Fetch stats
				const statsRes = await fetch('/api/users/me/stats', { headers });
				if (!statsRes.ok) throw new Error('Failed to fetch stats');
				const statsData = await statsRes.json();

				// Fetch history
				const historyRes = await fetch('/api/users/me/history', { headers });
				if (!historyRes.ok) throw new Error('Failed to fetch history');
				const historyData = await historyRes.json();

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
				console.error(error);
				// Optionally handle error, e.g. navigate to login if unauthorized
			} finally {
				setTimeout(() => {
					setLoading(false);
				}, 1500);
			}
		}

		fetchData();
	}, [navigate]);

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
			<div className="dashboard-header">
				<button className="back-btn" onClick={() => navigate('/menu')}>
					◀ BACK TO MENU
				</button>
			</div>

			<div className="dashboard-content">
				<h1 className="dashboard-title">DASHBOARD</h1>

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

					{/* Recent Battles */}
					<RecentBattles games={games} />
				</div>
			</div>
		</div>
	)
}