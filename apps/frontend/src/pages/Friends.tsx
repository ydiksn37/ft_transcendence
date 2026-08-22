import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfig } from '../hooks/useConfig';
import { AvatarIcon } from "@/components/UI/AvatarIcon";
import { getAvatarPreset } from "@/lib/avatarPresets";
import '../pages/Dashboard.css'

export default function Friends() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();

	const [friendships, setFriendships] = useState<any[]>([]);
	const [search, setSearch] = useState("");
	const [addFriendInput, setAddFriendInput] = useState("");
	const [currentUser, setCurrentUser] = useState<any>(null);

	const fetchFriends = async () => {
		try {
			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/friends', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.ok) {
				const data = await res.json();
				setFriendships(data);
			}
		} catch (error) {
			console.error("Failed to fetch friends", error);
		}
	};

	const fetchCurrentUser = async () => {
		try {
			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/me', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.ok) {
				const data = await res.json();
				setCurrentUser(data);
			}
		} catch (error) {
			console.error("Failed to fetch current user", error);
		}
	};

	useEffect(() => {
		fetchCurrentUser();
		fetchFriends();
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu && document.activeElement?.tagName !== 'INPUT') {
				navigate(mode ? `/dashboard?mode=${mode}` : '/dashboard', { state: { skipLoading: true } });
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu, mode]);

	const handleAddFriend = async () => {
		if (!addFriendInput.trim()) return;
		try {
			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/friends/request', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}` 
				},
				body: JSON.stringify({ username: addFriendInput })
			});
			
			if (res.ok) {
				setAddFriendInput("");
				fetchFriends();
				alert('Friend request sent!');
			} else {
				const errorData = await res.json();
				alert(errorData.message || 'Failed to send friend request');
			}
		} catch (error: any) {
			console.error("Failed to send friend request", error);
			alert('Failed to send friend request');
		}
	};

	const handleAccept = async (id: string) => {
		try {
			const token = localStorage.getItem('token');
			const res = await fetch(`/api/users/friends/${id}`, {
				method: 'PATCH',
				headers: { 
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}` 
				},
				body: JSON.stringify({ accept: true })
			});
			if (res.ok) fetchFriends();
		} catch (error) {
			console.error("Failed to accept friend request", error);
		}
	};

	const handleDecline = async (id: string) => {
		try {
			const token = localStorage.getItem('token');
			const res = await fetch(`/api/users/friends/${id}`, {
				method: 'PATCH',
				headers: { 
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}` 
				},
				body: JSON.stringify({ accept: false })
			});
			if (res.ok) fetchFriends();
		} catch (error) {
			console.error("Failed to decline friend request", error);
		}
	};

	const handleRemoveFriend = async (friendId: string) => {
		if (!confirm('Are you sure you want to remove this friend?')) return;
		try {
			const token = localStorage.getItem('token');
			const res = await fetch(`/api/users/friends/${friendId}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.ok) fetchFriends();
		} catch (error) {
			console.error("Failed to remove friend", error);
		}
	};

	const currentUserId = currentUser?.id;
	
	const friends = friendships
		.filter(f => f.status === 'ACCEPTED')
		.map(f => f.requesterId === currentUserId ? { ...f.addressee, friendshipId: f.id } : { ...f.requester, friendshipId: f.id });

	const pendingRequests = friendships
		.filter(f => f.status === 'PENDING' && f.addresseeId === currentUserId)
		.map(f => ({ ...f.requester, friendshipId: f.id }));

	const keyword = search.trim().toLowerCase();
	const filteredFriends = keyword
		? friends.filter((f) => 
			f.displayName?.toLowerCase().includes(keyword) || 
			f.username?.toLowerCase().includes(keyword)
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
				<div className="dashboard-subtitle">{friends.filter(f => f.isOnline).length} FRIENDS ONLINE</div>

				<div className="dashboard-panels" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
					
					<div className="arcade-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="SEARCH FRIENDS..."
							style={{ 
								width: '100%', padding: '15px', backgroundColor: '#000', color: '#fff',
								border: '4px solid #333', fontSize: '14px', fontFamily: "'Press Start 2P', monospace", boxSizing: 'border-box'
							}}
						/>
						
						<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
							{filteredFriends.length === 0 && <div style={{ color: '#555', textAlign: 'center', padding: '20px' }}>NO FRIENDS FOUND</div>}
							{filteredFriends.map(f => {
								const preset = getAvatarPreset(f.avatarId || f.id?.charCodeAt(0) % 8 || 0);
								return (
									<div key={f.id} className="friend-item" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#1a1a1a', border: '2px solid #333' }}>
										<AvatarIcon color={preset.color} symbol={preset.symbol} photo={f.avatarUrl} size={48} />
										<div style={{ flex: 1, minWidth: '120px' }}>
											<div style={{ fontSize: '16px', fontWeight: 'bold' }}>{f.displayName || f.username}</div>
											<div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>@{f.username}</div>
										</div>
										<div className="friend-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
											<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
												<div style={{ width: '10px', height: '10px', backgroundColor: f.isOnline ? '#4caf50' : '#555', borderRadius: '50%', boxShadow: f.isOnline ? '0 0 10px #4caf50' : 'none' }} />
												<span style={{ fontSize: '10px', color: f.isOnline ? '#4caf50' : '#888' }}>{f.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
											</div>
											<button 
												onClick={() => handleRemoveFriend(f.id)}
												style={{ padding: '5px 10px', backgroundColor: '#e74c3c', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>
												REMOVE
											</button>
										</div>
									</div>
								)
							})}
						</div>
					</div>

					<div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '30px', minWidth: 0 }}>
						
						<div className="arcade-panel" style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>
							<div style={{ fontSize: '14px', color: '#3498db', borderBottom: '4px solid #444', paddingBottom: '10px' }}>ADD FRIEND</div>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
								<input
									type="text"
									value={addFriendInput}
									onChange={(e) => setAddFriendInput(e.target.value)}
									placeholder="@USERNAME"
									style={{ 
										flex: '1 1 150px', padding: '10px', backgroundColor: '#000', color: '#fff',
										border: '2px solid #333', fontSize: '12px', fontFamily: "'Press Start 2P', monospace", minWidth: 0
									}}
								/>
								<button 
									onClick={handleAddFriend}
									style={{ 
										flex: '1 1 auto',
										padding: '10px 15px', backgroundColor: '#3498db', color: '#fff',
										border: '2px solid #fff', fontSize: '12px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace"
									}}
								>
									ADD
								</button>
							</div>
						</div>

						<div className="arcade-panel" style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>
							<div style={{ fontSize: '14px', color: '#f1c40f', borderBottom: '4px solid #444', paddingBottom: '10px' }}>PENDING ({pendingRequests.length})</div>
							{pendingRequests.length === 0 && <div style={{ color: '#555', fontSize: '12px', textAlign: 'center' }}>NONE</div>}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
								{pendingRequests.map(r => (
									<div key={r.friendshipId} style={{ padding: '10px', backgroundColor: '#1a1a1a', border: '2px solid #333', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
											<span style={{ fontSize: '12px', wordBreak: 'break-all' }}>@{r.username}</span>
										</div>
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
											<button onClick={() => handleAccept(r.friendshipId)} style={{ flex: 1, padding: '8px', backgroundColor: '#4caf50', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>ACCEPT</button>
											<button onClick={() => handleDecline(r.friendshipId)} style={{ flex: 1, padding: '8px', backgroundColor: '#e74c3c', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>DECLINE</button>
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