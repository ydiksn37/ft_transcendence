import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfig } from '../hooks/useConfig';
import { getFriends, getPendingRequests } from "@/lib/mock"
import { AvatarIcon } from "@/components/UI/AvatarIcon";
import { getAvatarPreset } from "@/lib/avatarPresets";
import '../pages/Dashboard.css'

export default function Friends() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();

	const friends = getFriends();
	const requests = getPendingRequests();

	const [search, setSearch] = useState("");
	const [addFriendInput, setAddFriendInput] = useState("");

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu && document.activeElement?.tagName !== 'INPUT') {
				navigate(mode ? `/dashboard?mode=${mode}` : '/dashboard', { state: { skipLoading: true } });
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu, mode]);

	const keyword = search.trim().toLowerCase();
	const filtered = keyword
		? friends.filter((f) => 
			f.displayName.toLowerCase().includes(keyword) || 
			f.username.toLocaleLowerCase().includes(keyword)
		)
		: friends;

	return (
		<div className="dashboard-container">
			<div className="dashboard-header">
				<button className="back-btn" onClick={() => navigate(mode ? `/dashboard?mode=${mode}` : '/dashboard', { state: { skipLoading: true } })}>
					◀ BACK TO DASHBOARD
				</button>
			</div>

			<div className="dashboard-content">
				<h1 className="dashboard-title" style={{ color: '#3498db' }}>FRIENDS LIST</h1>
				<div className="dashboard-subtitle">{friends.length} FRIENDS ONLINE</div>

				<div className="dashboard-panels" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
					
					{/* Left: Friends List */}
					<div className="arcade-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="SEARCH FRIENDS..."
							style={{ 
								width: '100%', padding: '15px', backgroundColor: '#000', color: '#fff',
								border: '4px solid #333', fontSize: '14px', fontFamily: "'Press Start 2P', monospace"
							}}
						/>
						
						<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
							{filtered.length === 0 && <div style={{ color: '#555', textAlign: 'center', padding: '20px' }}>NO FRIENDS FOUND</div>}
							{filtered.map(f => {
								const preset = getAvatarPreset((f as any).avatarId || f.id.charCodeAt(0) % 8);
								return (
									<div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#1a1a1a', border: '2px solid #333' }}>
										<AvatarIcon color={preset.color} symbol={preset.symbol} photo={f.avatarUrl} size={48} />
										<div style={{ flex: 1 }}>
											<div style={{ fontSize: '16px', fontWeight: 'bold' }}>{f.displayName || f.username}</div>
											<div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>@{f.username}</div>
										</div>
										<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
											<div style={{ width: '10px', height: '10px', backgroundColor: f.isOnline ? '#4caf50' : '#555', borderRadius: '50%', boxShadow: f.isOnline ? '0 0 10px #4caf50' : 'none' }} />
											<span style={{ fontSize: '10px', color: f.isOnline ? '#4caf50' : '#888' }}>{f.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
										</div>
									</div>
								)
							})}
						</div>
					</div>

					{/* Right: Add Friend & Pending */}
					<div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '30px' }}>
						
						{/* Add Friend */}
						<div className="arcade-panel" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
							<div style={{ fontSize: '14px', color: '#3498db', borderBottom: '4px solid #444', paddingBottom: '10px' }}>ADD FRIEND</div>
							<div style={{ display: 'flex', gap: '10px' }}>
								<input
									type="text"
									value={addFriendInput}
									onChange={(e) => setAddFriendInput(e.target.value)}
									placeholder="@USERNAME"
									style={{ 
										flex: 1, padding: '10px', backgroundColor: '#000', color: '#fff',
										border: '2px solid #333', fontSize: '12px', fontFamily: "'Press Start 2P', monospace", minWidth: 0
									}}
								/>
								<button 
									style={{ 
										padding: '10px 15px', backgroundColor: '#3498db', color: '#fff',
										border: '2px solid #fff', fontSize: '12px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace"
									}}
								>
									ADD
								</button>
							</div>
						</div>

						{/* Pending Requests */}
						<div className="arcade-panel" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
							<div style={{ fontSize: '14px', color: '#f1c40f', borderBottom: '4px solid #444', paddingBottom: '10px' }}>PENDING ({requests.length})</div>
							{requests.length === 0 && <div style={{ color: '#555', fontSize: '12px', textAlign: 'center' }}>NONE</div>}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
								{requests.map(r => (
									<div key={r.id} style={{ padding: '10px', backgroundColor: '#1a1a1a', border: '2px solid #333', display: 'flex', flexDirection: 'column', gap: '10px' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
											<span style={{ fontSize: '12px' }}>@{r.username}</span>
										</div>
										<div style={{ display: 'flex', gap: '10px' }}>
											<button style={{ flex: 1, padding: '8px', backgroundColor: '#4caf50', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer' }}>ACCEPT</button>
											<button style={{ flex: 1, padding: '8px', backgroundColor: '#e74c3c', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer' }}>DECLINE</button>
										</div>
									</div>
								))}
							</div>
						</div>

					</div>

				</div>
			</div>
		</div>
	)
}