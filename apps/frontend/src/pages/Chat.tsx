import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfig } from '../hooks/useConfig';
import { useAuth } from '../hooks/useAuth';
import { io, Socket } from "socket.io-client";
import { AvatarIcon } from "@/components/UI/AvatarIcon";
import { getAvatarPreset } from "@/lib/avatarPresets";
import '../pages/Dashboard.css'

export default function Chat() {
	const navigate = useNavigate();
	const location = useLocation();
	const mode = new URLSearchParams(location.search).get('mode');
	const { keyConfig } = useConfig();
	const { user, token } = useAuth();

	const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
	const [messages, setMessages] = useState<any[]>([]);
	const [inputText, setInputText] = useState("");
	const [socket, setSocket] = useState<Socket | null>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === keyConfig.quitToMenu && document.activeElement?.tagName !== 'INPUT') {
				navigate(mode ? `/dashboard?mode=${mode}` : '/dashboard', { state: { skipLoading: true } });
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
			if (data.length > 0) {
				const globalRoom = data.find((r: any) => r.type === 'GLOBAL') || data[0];
				setActiveRoomId(globalRoom.id);
			}
		});
	}, [token]);

	// Fetch Messages for active room
	useEffect(() => {
		if (!activeRoomId || !token) return;
		fetch(`/api/chat/rooms/${activeRoomId}/messages`, {
			headers: { 'Authorization': `Bearer ${token}` }
		})
		.then(res => res.json())
		.then(data => setMessages(data));
	}, [activeRoomId, token]);

	// Socket connection
	useEffect(() => {
		if (!token) return;
		const newSocket = io('/', { 
			forceNew: true,
			auth: { token }
		});
		setSocket(newSocket);

		newSocket.on('chat_message', (msg: any) => {
			setMessages((prev) => [...prev, msg]);
		});

		return () => {
			newSocket.disconnect();
		};
	}, [token]);

	// Join socket room
	useEffect(() => {
		if (socket && activeRoomId) {
			// A basic emit to notify the server about joining the room could be sent here
			// if required, but socket.io broadcast to 'global' room might just work if server is configured.
		}
	}, [socket, activeRoomId]);

	const handleSend = () => {
		if (!inputText.trim() || !activeRoomId || !socket) return;
		
		socket.emit('chat_message', { 
			roomId: activeRoomId, 
			content: inputText.trim() 
		});
		
		setInputText("");
	}

	if (!user) return null;

	return (
		<div className="dashboard-container">
			<div className="dashboard-header">
				<button className="back-btn" onClick={() => navigate(mode ? `/dashboard?mode=${mode}` : '/dashboard', { state: { skipLoading: true } })}>
					◀ BACK TO DASHBOARD
				</button>
			</div>

			<div className="dashboard-content" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
				<h1 className="dashboard-title" style={{ color: '#e91e63' }}>GLOBAL CHAT</h1>
				<div className="dashboard-subtitle">Chat with other players</div>

				<div className="arcade-panel" style={{ flex: 1, width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
					
					{/* Messages Area */}
					<div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
						{messages.map((m) => {
							const isMe = m.sender.id === user.id;
							const preset = getAvatarPreset(m.sender.avatarId || m.sender.id?.charCodeAt(0) % 8 || 0);
							return (
								<div key={m.id} style={{ display: 'flex', gap: '10px', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
									<AvatarIcon color={preset.color} symbol={preset.symbol} photo={m.sender.avatarUrl} size={32} />
									<div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
										<div style={{ fontSize: '10px', color: '#888', marginBottom: '5px' }}>{m.sender.displayName || m.sender.username}</div>
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
							onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
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
	)
}