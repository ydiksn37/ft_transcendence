import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfig } from '../hooks/useConfig';
import { AvatarIcon } from "@/components/UI/AvatarIcon";
import { resolveAvatar } from "@/lib/avatarPresets";
import { io } from "socket.io-client";
import '../pages/Dashboard.css'
import './ProfileLinks.css'

export default function Friends() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();
	const openProfile = (id: string) => navigate(`/profile/${id}`, { state: {
		returnTo: `${location.pathname}${location.search}`,
		returnLabel: 'FRIENDS',
	} });

	const [friendships, setFriendships] = useState<any[]>([]);
	const [search, setSearch] = useState("");
	const [addFriendInput, setAddFriendInput] = useState("");
	const [currentUser, setCurrentUser] = useState<any>(null);
	const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
	const [showSuggest, setShowSuggest] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		const token = localStorage.getItem('token');
		if (!token) return;
		const socket = io('/', { forceNew: true, auth: { token } });
		socket.on('user_status_changed', () => {
			fetchFriends();
		});
		return () => {
			socket.disconnect();
		};
	}, []);

	useEffect(() => {
		const searchInput = addFriendInput.trim();
		const controller = new AbortController();
		setSuggestedUsers([]);
		if (searchInput.length === 0) {
			setSuggestedUsers([]);
			return;
		}
		const timeoutId = setTimeout(async () => {
			try {
				const token = localStorage.getItem('token');
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchInput)}`, {
					signal: controller.signal,
					headers: { Authorization: `Bearer ${token}` }
				});
				if (res.ok) {
					const data = await res.json();
					if (!controller.signal.aborted) setSuggestedUsers(data.data || []);
				}
			} catch {
				if (!controller.signal.aborted) setSuggestedUsers([]);
			}
		}, 300);
		return () => { clearTimeout(timeoutId); controller.abort(); };
	}, [addFriendInput]);

	const fetchFriends = async () => {
		try {
			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/friends', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Failed to fetch friends');
			const data = await res.json();
			setFriendships(data);
		} catch {
			setError('Could not load the friends list.');
		}
	};

	const fetchCurrentUser = async () => {
		try {
			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/me', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Failed to fetch current user');
			const data = await res.json();
			setCurrentUser(data);
		} catch {
			setError('Could not load your profile.');
		}
	};

	useEffect(() => {
		fetchCurrentUser();
		fetchFriends();
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu && document.activeElement?.tagName !== 'INPUT') {
				navigate(mode ? `/profile?tab=overview&mode=${mode}` : '/profile?tab=overview');
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu, mode]);

	const handleAddFriend = async () => {
		const username = addFriendInput.trim();
		if (username.length < 3 || username.length > 21) {
			setError('Username must be 3-21 characters.');
			return;
		}
		setError('');
		try {
			const token = localStorage.getItem('token');
			const res = await fetch('/api/users/friends/request', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}` 
				},
				body: JSON.stringify({ username })
			});
			
			if (res.ok) {
				setAddFriendInput("");
				fetchFriends();
				alert('Friend request sent!');
			} else {
				const errorData = await res.json();
				alert(errorData.message || 'Failed to send friend request');
			}
		} catch {
			setError('Failed to send friend request.');
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
		} catch {
			setError('Failed to accept friend request.');
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
		} catch {
			setError('Failed to decline friend request.');
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
		} catch {
			setError('Failed to remove friend.');
		}
	};

	const currentUserId = currentUser?.id;
	
	const friends = friendships
		.filter(f => f.status === 'ACCEPTED')
		.map(f => f.requesterId === currentUserId ? { ...f.addressee, friendshipId: f.id } : { ...f.requester, friendshipId: f.id });

	const incomingRequests = friendships
		.filter(f => f.status === 'PENDING' && f.addresseeId === currentUserId)
		.map(f => ({ ...f.requester, friendshipId: f.id, type: 'incoming' }));

	const outgoingRequests = friendships
		.filter(f => f.status === 'PENDING' && f.requesterId === currentUserId)
		.map(f => ({ ...f.addressee, friendshipId: f.id, type: 'outgoing' }));

	const pendingRequests = [...incomingRequests, ...outgoingRequests];

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
				<button className="back-btn" onClick={() => navigate(mode ? `/profile?tab=overview&mode=${mode}` : '/profile?tab=overview')}>
					◀ BACK TO PROFILE
				</button>
			</div>

			<div className="dashboard-content">
				<h1 className="dashboard-title" style={{ color: '#3498db' }}>FRIENDS LIST</h1>
				<div className="dashboard-subtitle">{friends.filter(f => f.isOnline).length} FRIENDS ONLINE</div>
				{error && <p role="alert" style={{ color: '#ff6b6b' }}>{error}</p>}

				<div className="dashboard-panels" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
					
					<div className="arcade-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							maxLength={100}
							placeholder="SEARCH FRIENDS..."
							style={{ 
								width: '100%', padding: '15px', backgroundColor: '#000', color: '#fff',
								border: '4px solid #333', fontSize: '14px', fontFamily: "'Press Start 2P', monospace", boxSizing: 'border-box'
							}}
						/>
						
						<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
							{filteredFriends.length === 0 && <div style={{ color: '#555', textAlign: 'center', padding: '20px' }}>NO FRIENDS FOUND</div>}
							{filteredFriends.map(f => {
								const avatar = resolveAvatar(f.id, f.avatarUrl);
								return (
									<div key={f.id} className="friend-item" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#1a1a1a', border: '2px solid #333' }}>
										<button type="button" className="user-profile-link friend-profile-link" onClick={() => openProfile(f.id)} aria-label={`View ${f.displayName || f.username}'s profile`}>
											<AvatarIcon color={avatar.preset.color} symbol={avatar.preset.symbol} photo={avatar.photo} size={48} />
											<div style={{ flex: 1, minWidth: '120px' }}>
											<div style={{ fontSize: '16px', fontWeight: 'bold' }}>{f.displayName || f.username}</div>
											<div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>@{f.username}</div>
											</div>
										</button>
										<div className="friend-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
											<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
												<div style={{ width: '10px', height: '10px', backgroundColor: f.isOnline ? '#4caf50' : '#555', borderRadius: '50%', boxShadow: f.isOnline ? '0 0 10px #4caf50' : 'none' }} />
												<span style={{ fontSize: '10px', color: f.isOnline ? '#4caf50' : '#888' }}>{f.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
											</div>
											<button 
												onClick={async () => {
													try {
														const token = localStorage.getItem('token');
														const res = await fetch('/api/chat/rooms/direct', {
															method: 'POST',
															headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
															body: JSON.stringify({ targetUserId: f.id })
														});
														if (res.ok) {
															const room = await res.json();
															navigate(`/chat?room=${room.id}${mode ? '&mode='+mode : ''}`);
														}
													} catch { alert('Could not open chat. Please retry.'); }
												}}
												style={{ padding: '5px 10px', backgroundColor: '#3498db', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>
												CHAT
											</button>
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
							<div style={{ position: 'relative' }}>
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
									<input
										type="text"
										value={addFriendInput}
										onChange={(e) => {
											setAddFriendInput(e.target.value);
											setShowSuggest(true);
										}}
										onFocus={() => setShowSuggest(true)}
										onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
										minLength={3}
										maxLength={21}
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
								{showSuggest && suggestedUsers.length > 0 && (
									<div style={{
										position: 'absolute', top: '100%', left: 0, right: 0, 
										backgroundColor: '#222', border: '2px solid #444', 
										zIndex: 10, display: 'flex', flexDirection: 'column',
										maxHeight: '150px', overflowY: 'auto'
									}}>
										{suggestedUsers.map(u => (
											<div 
												key={u.id}
												onClick={() => {
													setAddFriendInput(u.username);
													setShowSuggest(false);
												}}
												style={{
													padding: '10px', cursor: 'pointer', fontSize: '10px',
													borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '10px'
												}}
											>
												<span style={{color: '#3498db'}}>@{u.username}</span> 
												<span style={{color: '#888'}}>{u.displayName}</span>
											</div>
										))}
									</div>
								)}
							</div>
						</div>

						<div className="arcade-panel" style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>
							<div style={{ fontSize: '14px', color: '#f1c40f', borderBottom: '4px solid #444', paddingBottom: '10px' }}>PENDING ({pendingRequests.length})</div>
							{pendingRequests.length === 0 && <div style={{ color: '#555', fontSize: '12px', textAlign: 'center' }}>NONE</div>}
							<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
								{pendingRequests.map(r => (
									<div key={r.friendshipId} style={{ padding: '10px', backgroundColor: '#1a1a1a', border: '2px solid #333', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
											<button type="button" className="user-profile-name" onClick={() => openProfile(r.id)}>@{r.username}</button>
										</div>
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
											{r.type === 'incoming' ? (
												<>
													<button onClick={() => handleAccept(r.friendshipId)} style={{ flex: 1, padding: '8px', backgroundColor: '#4caf50', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>ACCEPT</button>
													<button onClick={() => handleDecline(r.friendshipId)} style={{ flex: 1, padding: '8px', backgroundColor: '#e74c3c', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>DECLINE</button>
												</>
											) : (
												<button onClick={() => handleRemoveFriend(r.id)} style={{ flex: 1, padding: '8px', backgroundColor: '#555', border: 'none', color: 'white', fontSize: '10px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace" }}>CANCEL REQUEST</button>
											)}
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
