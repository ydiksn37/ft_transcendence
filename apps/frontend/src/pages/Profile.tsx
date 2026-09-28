import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { RecentBattles } from "@/components/dashboard/RecentBattles"
import { Progression } from "@/components/dashboard/Progression"
import type { UserStats, GameRecordView } from "@/lib/types"
import { useConfig } from '../hooks/useConfig'
import { TETROMINOS } from '../utils/tetrominos'
import { AVATAR_PRESETS, getAvatarPreset } from "@/lib/avatarPresets"
import { AvatarIcon } from "@/components/UI/AvatarIcon"
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../utils/cropImage'
import '../pages/Dashboard.css'
import '../pages/JoinPage.css'
import './LobbyPage.css'

export default function Profile() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();
	const [stats, setStats] = useState<UserStats | null>(null);
	const [games, setGames] = useState<GameRecordView[]>([]);
	const [user, setUser] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [loadingPiece, setLoadingPiece] = useState<any>(null);
	const [selectedIndex, setSelectedIndex] = useState(-1); // 0: BACK, 1: SETTINGS, 2: ADMIN

	// Cropper states
	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

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
			
			if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
				setSelectedIndex(0);
			} else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
				setSelectedIndex(1);
			} else if (e.code === 'Enter') {
				if (selectedIndex === 0) {
					navigate(mode ? `/lobby/${mode}` : '/menu');
				} else if (selectedIndex === 1) {
					navigate(mode ? `/settings?mode=${mode}` : '/settings');
				} else if (selectedIndex === 2) {
					navigate(mode ? `/admin?mode=${mode}` : '/admin');
				}
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu, mode, selectedIndex]);

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
			} catch {
				setError('Could not load your profile. Please retry.');
			} finally {
				setLoading(false);
			}
		}

		fetchData();
	}, [navigate]);

	const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
		if (event.target.files && event.target.files.length > 0) {
			const file = event.target.files[0];
			if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
				setError('Avatar must be a JPG, PNG, GIF, or WebP image.');
				event.target.value = '';
				return;
			}
			if (file.size > 2 * 1024 * 1024) {
				setError('Avatar must not exceed 2 MB.');
				event.target.value = '';
				return;
			}
			setError('');
			const reader = new FileReader();
			reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null));
			reader.readAsDataURL(file);
		}
		// Reset input value so the same file can be selected again
		event.target.value = '';
	};

	const onCropComplete = (_croppedArea: any, croppedAreaPixels: any) => {
		setCroppedAreaPixels(croppedAreaPixels);
	};

	const uploadCroppedImage = async () => {
		if (!imageSrc || !croppedAreaPixels) return;
		try {
			setLoading(true);
			const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
			
			const formData = new FormData();
			formData.append('avatar', croppedImageBlob, 'avatar.jpg');

			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/me/avatar', {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` },
				body: formData
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.message || 'Failed to upload avatar');
			}

			// Refetch user data
			const meRes = await fetch('/api/users/me', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (meRes.ok) {
				const me = await meRes.json();
				setUser(me);
			}
			
			// Close cropper modal
			setImageSrc(null);
		} catch (error: unknown) {
			setError(error instanceof Error ? error.message : 'Failed to upload avatar.');
		} finally {
			setLoading(false);
		}
	};

	if (!loading && error && (!user || !stats)) {
		return (
			<div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
				<p role="alert">{error}</p>
				<button onClick={() => window.location.reload()}>RETRY</button>
			</div>
		);
	}

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

	const isPreset = user.avatarUrl?.startsWith('preset:');
	const presetIndex = isPreset ? parseInt(user.avatarUrl.split(':')[1]) : 0;
	const preset = getAvatarPreset(presetIndex);
	const photoUrl = (!isPreset && user.avatarUrl) ? user.avatarUrl : undefined;

	return (
		<div className="dashboard-container">
			<div className="dashboard-header">
				<button 
					className={`back-btn ${selectedIndex === 0 ? 'selected' : ''}`} 
					onClick={() => navigate(mode ? `/lobby/${mode}` : '/menu')}
					onMouseEnter={() => setSelectedIndex(0)}
					onMouseLeave={() => setSelectedIndex(-1)}
					style={selectedIndex === 0 ? { backgroundColor: '#555' } : {}}
				>
					◀ BACK TO LOBBY
				</button>
				<button 
					className={`nav-btn ${selectedIndex === 1 ? 'selected' : ''}`} 
					onClick={() => navigate(mode ? `/settings?mode=${mode}` : '/settings')} 
					onMouseEnter={() => setSelectedIndex(1)}
					onMouseLeave={() => setSelectedIndex(-1)}
					style={selectedIndex === 1 ? { backgroundColor: '#555' } : {}}
				>
					{selectedIndex === 1 ? '▶ SETTINGS' : 'SETTINGS'}
				</button>
				{(user.role === 'ADMIN' || user.role === 'MODERATOR') && (
					<button 
						className={`nav-btn ${selectedIndex === 2 ? 'selected' : ''}`} 
						onClick={() => navigate(mode ? `/admin?mode=${mode}` : '/admin')} 
						onMouseEnter={() => setSelectedIndex(2)}
						onMouseLeave={() => setSelectedIndex(-1)}
						style={selectedIndex === 2 ? { backgroundColor: '#e74c3c' } : { borderColor: '#e74c3c', color: '#e74c3c' }}
					>
						{selectedIndex === 2 ? '▶ ADMIN PANEL' : 'ADMIN PANEL'}
					</button>
				)}
			</div>

			<div className="dashboard-content">
				<h1 className="dashboard-title">MY PROFILE</h1>
				{error && <p role="alert" style={{ color: '#ff6b6b' }}>{error}</p>}
				<div className="dashboard-subtitle">@{user.username}</div>

				<div className="dashboard-panels">
					<div style={{ display: 'flex', gap: '30px', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
						
						{/* プロフィール情報 */}
						<div className="arcade-panel" style={{ flex: '1 1 300px', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
							<AvatarIcon color={preset.color} symbol={preset.symbol} photo={photoUrl} size={96} />
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
							
							<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
								<label style={{ 
									cursor: 'pointer', backgroundColor: '#3498db', color: 'white', 
									padding: '10px', textAlign: 'center', borderRadius: '4px',
									fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
									border: '2px solid white', boxShadow: '2px 2px 0px #000'
								}}>
									UPLOAD CUSTOM IMAGE
									<input 
										type="file" 
										accept="image/png, image/jpeg, image/gif, image/webp" 
										style={{ display: 'none' }} 
										onChange={handleAvatarUpload}
									/>
								</label>
								<div style={{ fontSize: '10px', color: '#888', textAlign: 'center' }}>
									Max: 2MB (JPG/PNG/GIF/WebP)
								</div>
							</div>

							<div style={{ marginTop: '10px', fontSize: '12px', color: '#ccc' }}>Or choose a preset:</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
								{AVATAR_PRESETS.map((p, i) => {
									const selected = isPreset ? presetIndex === i : (!photoUrl && i === 0);
									return (
										<div key={i} style={{ 
											display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
											padding: '10px', backgroundColor: selected ? 'rgba(255,255,255,0.1)' : '#111',
											border: `2px solid ${selected ? p.color : '#333'}`,
											cursor: 'pointer'
										}} onClick={async () => {
											try {
												const token = localStorage.getItem('token');
												await fetch('/api/users/me', {
													method: 'PATCH',
													headers: { 
														'Content-Type': 'application/json',
														Authorization: `Bearer ${token}` 
													},
													body: JSON.stringify({ avatarUrl: `preset:${i}` })
												});
												setUser((prev: any) => ({ ...prev, avatarUrl: `preset:${i}` }));
											} catch {
												setError('Failed to update avatar.');
											}
										}}>
											<AvatarIcon color={p.color} symbol={p.symbol} size={32} />
										</div>
									)
								})}
							</div>
						</div>

					</div>

					<Progression />
					<RecentBattles games={games} />
				</div>
			</div>

			{/* Cropper Modal */}
			{imageSrc && (
				<div style={{
					position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
					backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999,
					display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
				}}>
					<div style={{ position: 'relative', width: '80%', height: '60%', backgroundColor: '#333', border: '4px solid #555' }}>
						<Cropper
							image={imageSrc}
							crop={crop}
							zoom={zoom}
							aspect={1}
							onCropChange={setCrop}
							onCropComplete={onCropComplete}
							onZoomChange={setZoom}
						/>
					</div>
					<div style={{ marginTop: '20px', width: '80%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
							<span style={{ color: 'white', fontSize: '12px', fontFamily: "'Press Start 2P', monospace" }}>ZOOM</span>
							<input
								type="range"
								value={zoom}
								min={1}
								max={3}
								step={0.1}
								aria-labelledby="Zoom"
								onChange={(e) => setZoom(Number(e.target.value))}
								style={{ flex: 1 }}
							/>
						</div>
						<div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
							<button 
								onClick={() => setImageSrc(null)}
								style={{ 
									flex: 1, padding: '15px', backgroundColor: '#e74c3c', color: 'white', 
									fontFamily: "'Press Start 2P', monospace", border: '2px solid white', 
									cursor: 'pointer', boxShadow: '4px 4px 0px #000' 
								}}
							>
								CANCEL
							</button>
							<button 
								onClick={uploadCroppedImage}
								disabled={loading}
								style={{ 
									flex: 1, padding: '15px', backgroundColor: '#4caf50', color: 'white', 
									fontFamily: "'Press Start 2P', monospace", border: '2px solid white', 
									cursor: 'pointer', boxShadow: '4px 4px 0px #000' 
								}}
							>
								{loading ? 'UPLOADING...' : 'CROP & UPLOAD'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
