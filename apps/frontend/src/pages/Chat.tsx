import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfig } from '../hooks/useConfig';
import { useAuth } from '../hooks/useAuth';
import { io, Socket } from "socket.io-client";
import { AvatarIcon } from "@/components/UI/AvatarIcon";
import { resolveAvatar } from "@/lib/avatarPresets";
import '../pages/Dashboard.css'
import './ProfileLinks.css'

export default function Chat() {
	const navigate = useNavigate();
	const location = useLocation();
	const searchParams = new URLSearchParams(location.search);
	const mode = searchParams.get('mode');
	const initialRoomId = searchParams.get('room');
	const { keyConfig } = useConfig();
	const { user, token } = useAuth();

	const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoomId);
	const [rooms, setRooms] = useState<any[]>([]);
	const [messages, setMessages] = useState<any[]>([]);
	const [messageReload, setMessageReload] = useState(0);
	const [inputText, setInputText] = useState("");
	const [socket, setSocket] = useState<Socket | null>(null);
	const openProfile = (id: string) => {
		if (!id) return;
		const params = new URLSearchParams();
		if (activeRoomId) params.set('room', activeRoomId);
		if (mode) params.set('mode', mode);
		const query = params.toString();
		navigate(`/profile/${id}`, { state: {
			returnTo: `/chat${query ? `?${query}` : ''}`,
			returnLabel: 'CHAT',
		} });
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu && document.activeElement?.tagName !== 'INPUT') {
				navigate(mode ? `/profile?tab=overview&mode=${mode}` : '/profile?tab=overview');
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [navigate, keyConfig.quitToMenu, mode]);

	// Fetch Rooms
	useEffect(() => {
		if (!token) return;
		fetch('/api/chat/rooms', {
			headers: { 'Authorization': `Bearer ${token}` }
		})
		.then(res => res.json())
		.then(data => {
			setRooms(data);
			if (data.length > 0) {
				const globalRoom = data.find((r: any) => r.type === 'GLOBAL') || data[0];
				setActiveRoomId(current => current ?? globalRoom.id);
			}
		});
	}, [token]);

	// Fetch Messages for active room
	useEffect(() => {
		if (!activeRoomId || !token) return;
		const controller = new AbortController();
		fetch(`/api/chat/rooms/${activeRoomId}/messages`, {
			headers: { 'Authorization': `Bearer ${token}` },
			signal: controller.signal,
		})
		.then(res => {
			if (!res.ok) throw new Error('Messages unavailable');
			return res.json();
		})
		.then(data => { if (!controller.signal.aborted) setMessages(data); })
		.catch(() => undefined);
		return () => controller.abort();
	}, [activeRoomId, token, messageReload]);

	// Socket connection
	useEffect(() => {
		if (!token) return;
		const newSocket = io('/', { 
			forceNew: true,
			auth: { token }
		});
		setSocket(newSocket);

		newSocket.on('chat:message', (msg: any) => {
			setMessages((prev) => {
				// Only append if the message belongs to the currently active room
				// To do this strictly, we could just re-fetch or check, but since we rely on socket broadcast
				// we just append. It's safer to always append and filter in render, but let's just append for now 
				// as room joining is managed per activeRoomId.
				return [...prev, msg];
			});
		});

		return () => {
			newSocket.disconnect();
		};
	}, [token]);

	// Join socket room
	useEffect(() => {
		if (socket && activeRoomId) {
			socket.emit('chat:join', { roomId: activeRoomId });
		}
	}, [socket, activeRoomId]);

	const handleSend = () => {
		if (!inputText.trim() || !activeRoomId || !socket) return;
		
		socket.emit('chat:message', { 
			roomId: activeRoomId, 
			content: inputText.trim() 
		});
		
		setInputText("");
	}

	if (!user) return null;

	return (
		<div className="dashboard-container">
			<div className="dashboard-header">
				<button className="back-btn" onClick={() => navigate(mode ? `/profile?tab=overview&mode=${mode}` : '/profile?tab=overview')}>
					◀ BACK TO PROFILE
				</button>
			</div>

			<div className="dashboard-content" style={{ height: '90dvh', maxHeight: 'none', display: 'flex', flexDirection: 'column' }}>
				<h1 className="dashboard-title" style={{ color: '#e91e63' }}>CHAT</h1>
				<div className="dashboard-subtitle">Talk with friends and the world</div>

				<div className="chat-layout" style={{ flex: 1, width: '100%', maxWidth: '1000px', display: 'flex', gap: '20px', overflow: 'hidden' }}>
					
					{/* Rooms Sidebar */}
					<div className="arcade-panel chat-sidebar" style={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', padding: '10px', gap: '10px', overflowY: 'auto' }}>
						<div style={{ color: '#fff', fontSize: '12px', borderBottom: '2px solid #444', paddingBottom: '10px', marginBottom: '10px' }}>ROOMS</div>
						{rooms.map(r => {
							const isGlobal = r.type === 'GLOBAL';
							const otherMember = !isGlobal ? r.memberships?.find((m:any) => m.userId !== user.id)?.user : null;
							const roomName = isGlobal ? "🌍 GLOBAL CHAT" : (otherMember ? `@${otherMember.username}` : "DIRECT CHAT");
							const isActive = r.id === activeRoomId;
							
							return (
								<button 
									key={r.id}
									onClick={() => {
										if (r.id === activeRoomId) {
											setMessageReload(value => value + 1);
										} else {
											setMessages([]);
											setActiveRoomId(r.id);
										}
									}}
									style={{
										padding: '15px 10px',
										backgroundColor: isActive ? '#e91e63' : '#222',
										border: isActive ? '2px solid #fff' : '2px solid #444',
										color: '#fff',
										cursor: 'pointer',
										textAlign: 'left',
										fontSize: '10px',
										fontFamily: "'Press Start 2P', monospace"
									}}
								>
									{roomName}
								</button>
							)
						})}
					</div>

					<div className="arcade-panel chat-messages" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
					
					{/* Messages Area */}
					<div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
						{messages.map((m) => {
							const isMe = m.sender.id === user.id;
							const avatar = resolveAvatar(m.sender.id, m.sender.avatarUrl);
							return (
								<div key={m.id} style={{ display: 'flex', gap: '10px', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
									<button type="button" className="user-profile-avatar" onClick={() => openProfile(m.sender.id)} aria-label={`View ${m.sender.displayName || m.sender.username}'s profile`}>
										<AvatarIcon color={avatar.preset.color} symbol={avatar.preset.symbol} photo={avatar.photo} size={32} />
									</button>
									<div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
										<button type="button" className="user-profile-name chat-profile-name" onClick={() => openProfile(m.sender.id)}>{m.sender.displayName || m.sender.username}</button>
										<div style={{ 
											backgroundColor: isMe ? '#e91e63' : '#333',
											color: 'white',
											padding: '10px 15px',
											border: `2px solid ${isMe ? '#ff80ab' : '#555'}`,
											fontSize: '12px',
											lineHeight: '1.4',
											wordBreak: 'break-word',
											fontFamily: "'Press Start 2P', monospace"
										}}>
											{m.content}
										</div>
										<div style={{ fontSize: '8px', color: '#555', marginTop: '5px' }}>
											{new Date(m.createdAt || m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
										</div>
									</div>
								</div>
							)
						})}
					</div>

					{/* Input Area */}
					<div style={{ padding: '15px', borderTop: '4px solid #444', backgroundColor: '#111', display: 'flex', gap: '10px' }}>
						<input 
							type="text" 
							value={inputText}
							onChange={(e) => setInputText(e.target.value)}
							maxLength={500}
							onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(); }}
							placeholder="Type a message..."
							style={{ 
								flex: 1, padding: '10px', backgroundColor: '#000', color: '#fff',
								border: '2px solid #555', fontSize: '12px', fontFamily: "'Press Start 2P', monospace", minWidth: 0
							}}
						/>
						<button 
							onClick={handleSend}
							style={{ 
								padding: '10px 20px', backgroundColor: '#e91e63', color: '#fff',
								border: '2px solid #fff', fontSize: '12px', cursor: 'pointer', fontFamily: "'Press Start 2P', monospace"
							}}
						>
							SEND
						</button>
					</div>

				</div>
				</div>
			</div>
		</div>
	)
}
