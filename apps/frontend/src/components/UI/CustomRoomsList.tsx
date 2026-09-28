import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { TournamentBracket } from './TournamentBracket';
import type { Tournament } from '../../types/tournament';
import '../../pages/LobbyPage.css';

type Room = {
  roomId: string;
  name: string;
  ownerId: string;
  isTournamentActive?: boolean;
};

type CustomRoomsListProps = {
  socket: Socket | null;
  setAppState: (state: 'MENU') => void;
  onBack?: () => void;
};

export const CustomRoomsList: React.FC<CustomRoomsListProps> = ({ socket, setAppState, onBack }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [customRoomId, setCustomRoomId] = useState('');
  const [inRoom, setInRoom] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [players, setPlayers] = useState<{ socketId: string; userId: string | null; username: string | null; wins: number }[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!socket) return;

    socket.emit('game:get_custom_rooms');
    socket.emit('game:request_custom_room_state');

    const handleRoomsUpdated = (updatedRooms: Room[]) => {
      setRooms(updatedRooms);
    };

    const handleRoomState = (data: { inRoom: boolean; roomId?: string; isOwner?: boolean; players?: any[]; isPlaying?: boolean; tournament?: Tournament; isPublic?: boolean }) => {
      if (data.isPublic !== undefined) setIsPublic(data.isPublic);
      if (!data.inRoom) {
        setInRoom(null);
        setIsOwner(false);
        setPlayers([]);
        setTournament(null);
      } else if (data.roomId) {
        setInRoom(data.roomId);
        setCustomRoomId(data.roomId);
        setIsOwner(data.isOwner || false);
        setPlayers(data.players || []);
        setIsPlaying(data.isPlaying || false);
        setTournament(data.tournament || null);
      }
    };

    const handleRoomCreated = (data: { roomId: string; name: string, players: any[]; isPublic?: boolean }) => {
      setIsPublic(data.isPublic ?? true);
      setInRoom(data.roomId);
      setCustomRoomId(data.roomId);
      setIsOwner(true);
      setPlayers(data.players || []);
      setTournament(null);
    };

    const handleRoomUpdate = (data: { players: any[] }) => {
      setPlayers(data.players || []);
    };

    const handleMatchFound = () => {
      // 試合が始まれば TetrisGame 側でアプリ状態が ONLINE_1V1 に遷移するので、ここでは何もしない
    };

    const handleError = (err: { message: string }) => {
      alert(err.message);
      if (err.message === 'Invalid Room ID' || err.message === 'Room ID already exists') {
        return; // Do not exit the room on update errors
      }
      setInRoom(null);
      setIsOwner(false);
      setPlayers([]);
      setTournament(null);
    };

    const handleRoomUpdated = (data: { oldId: string; newId: string }) => {
      setInRoom(data.newId);
      setCustomRoomId(data.newId);
    };

    const handleTournamentState = (data: { tournament: Tournament }) => {
      setTournament(data.tournament);
    };

    socket.on('custom_rooms_updated', handleRoomsUpdated);
    socket.on('custom_room_created', handleRoomCreated);
    socket.on('custom_room_id_updated', handleRoomUpdated);
    socket.on('custom_room_state', handleRoomState);
    socket.on('custom_room_players_updated', handleRoomUpdate);
    socket.on('match:found', handleMatchFound);
    socket.on('tournament_state', handleTournamentState);
    socket.on('error', handleError);
    const handleVisibility = (data: { isPublic: boolean }) => setIsPublic(data.isPublic);
    socket.on('custom_room_visibility', handleVisibility);

    return () => {
      socket.off('custom_rooms_updated', handleRoomsUpdated);
      socket.off('custom_room_created', handleRoomCreated);
      socket.off('custom_room_id_updated', handleRoomUpdated);
      socket.off('custom_room_state', handleRoomState);
      socket.off('custom_room_players_updated', handleRoomUpdate);
      socket.off('match:found', handleMatchFound);
      socket.off('tournament_state', handleTournamentState);
      socket.off('error', handleError);
      socket.off('custom_room_visibility', handleVisibility);
    };
  }, [socket]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inRoom) {
        if (onBack) {
          onBack();
        } else {
          setAppState('MENU');
        }
      } else if (e.key === 'Enter' && inRoom && tournament && !isPlaying && !tournament.root.winnerId && isOwner) {
        socket?.emit('game:start_tournament_match');
      } else if (e.key === 'Enter' && inRoom && (!tournament || tournament.root.winnerId) && !isPlaying && isOwner && players.length >= 2) {
        if (players.length >= 4) {
          socket?.emit('game:create_tournament');
        } else {
          socket?.emit('game:start_custom_room');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inRoom, onBack, setAppState, tournament, isPlaying, isOwner, socket, players.length]);

  const handleCreateRoom = () => {
    const name = newRoomName.trim();
    if (name.length > 40) {
      setValidationError('Room name must not exceed 40 characters.');
      return;
    }
    setValidationError('');
    if (socket) {
      socket.emit('game:create_custom_room', { name, isPublic });
    }
  };

  const handleUpdateRoomId = () => {
    if (!/^[A-Za-z0-9]{4}$/.test(customRoomId)) {
      setValidationError('Room ID must contain exactly 4 letters or numbers.');
      return;
    }
    setValidationError('');
    if (socket && inRoom) {
      socket.emit('game:update_custom_room_id', { newRoomId: customRoomId });
    }
  };

  const handleJoinRoom = (roomId: string) => {
    const normalizedRoomId = roomId.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,24}$/.test(normalizedRoomId)) {
      setValidationError('Room ID must be 4-24 letters, numbers, underscores, or hyphens.');
      return;
    }
    setValidationError('');
    if (socket) {
      socket.emit('game:join_custom_room', { roomId: normalizedRoomId });
      socket.emit('game:request_custom_room_state');
      setInRoom(normalizedRoomId);
      setCustomRoomId(normalizedRoomId);
      setIsOwner(false);
    }
  };

  const getPlayerName = (socketId: string) => {
    // トーナメントの playerNames マップを最優先で参照（退出済みプレイヤーも解決できる）
    if (tournament?.playerNames?.[socketId]) {
      return tournament.playerNames[socketId];
    }
    const idx = players.findIndex(p => p.socketId === socketId);
    if (idx === -1) return `Player (left)`;
    const p = players[idx];
    return p.username || 'Player';
  };

  return (
    <div className="lobby-container" style={{ alignItems: 'center', backgroundColor: 'transparent' }}>
      {!tournament && (
        <h1 className="mode-title" style={{ color: '#d35400', fontSize: '32px', marginBottom: '30px' }}>
          CUSTOM ROOMS
        </h1>
      )}
      {validationError && <p role="alert" style={{ color: '#ff6b6b' }}>{validationError}</p>}
      
      {!inRoom ? (
        <>
          <div style={{ marginBottom: '40px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
            <label>
              VISIBILITY{' '}
              <select aria-label="Room visibility" value={isPublic ? 'public' : 'private'} onChange={e => setIsPublic(e.target.value === 'public')}>
                <option value="public">PUBLIC</option>
                <option value="private">PRIVATE (ROOM ID ONLY)</option>
              </select>
            </label>
            <input 
              type="text" 
              placeholder="ROOM NAME" 
              value={newRoomName} 
              onChange={(e) => setNewRoomName(e.target.value)}
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateRoom();
                }
              }}
              style={{ 
                width: '250px', 
                padding: '12px', 
                fontSize: '14px', 
                borderRadius: '0', 
                border: '4px solid #555', 
                backgroundColor: '#000', 
                color: '#fff', 
                fontFamily: "'Press Start 2P', monospace",
                outline: 'none'
              }}
            />
            <button 
              className="nav-btn"
              onClick={handleCreateRoom}
              style={{ padding: '0 20px', height: '48px', fontSize: '14px', borderColor: '#4caf50', color: '#4caf50' }}
            >
              CREATE ROOM
            </button>
          </div>

          <form onSubmit={e => { e.preventDefault(); if (joinRoomId.trim()) handleJoinRoom(joinRoomId.trim()); }} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input aria-label="Room ID to join" placeholder="ROOM ID" value={joinRoomId} minLength={4} maxLength={24} pattern="[A-Za-z0-9_-]{4,24}" onChange={e => setJoinRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24).toUpperCase())} />
            <button className="nav-btn" type="submit" disabled={!joinRoomId.trim()}>JOIN BY ID</button>
          </form>
          <div className="panel" style={{ width: '100%', maxWidth: '600px', flexDirection: 'column', gap: '15px', padding: '20px', minHeight: '300px', justifyContent: 'flex-start' }}>
            {rooms.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#aaa', fontSize: '12px', lineHeight: '2' }}>NO ROOMS AVAILABLE.</p>
            ) : (
              rooms.map((room) => (
                <div key={room.roomId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#111', border: '4px solid #333' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <span style={{ fontSize: '14px', color: '#fff' }}>{room.name || `ROOM ${room.roomId}`}</span>
                    <span style={{ fontSize: '10px', color: '#aaa' }}>ID: {room.roomId}</span>
                  </div>
                  <button 
                    className="nav-btn"
                    onClick={() => handleJoinRoom(room.roomId)}
                    style={{ borderColor: '#e74c3c', color: '#e74c3c', height: '40px', padding: '0 15px' }}
                  >
                    {room.isTournamentActive ? 'SPECTATE' : 'JOIN'}
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : tournament ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1 }}>
          <h1 style={{ color: '#f1c40f', fontSize: '32px', marginBottom: '60px', textShadow: '4px 4px 0 #000' }}>
            TOURNAMENT BRACKET
          </h1>
          
          <div style={{ width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center', marginBottom: '60px', padding: '0 20px' }}>
            <TournamentBracket 
              node={tournament.root} 
              getPlayerName={getPlayerName} 
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', marginTop: 'auto', paddingBottom: '40px' }}>
            {!isPlaying && !tournament.root.winnerId && (
              isOwner ? (
                <button
                  className="start-game-btn"
                  onClick={() => socket?.emit('game:start_tournament_match')}
                  style={{ borderColor: '#2ecc71', color: '#2ecc71', boxShadow: '0 0 20px #2ecc71' }}
                >
                  START NEXT MATCH
                </button>
              ) : (
                <div style={{ padding: '20px 40px', fontSize: '16px', backgroundColor: '#111', color: '#f1c40f', border: '4px solid #f1c40f', fontWeight: 'bold', textAlign: 'center', animation: 'neon-pulse 1.5s infinite' }}>
                  WAITING FOR OWNER TO START MATCH...
                </div>
              )
            )}
            
            {isPlaying && (
              <button 
                className="start-game-btn"
                onClick={() => { socket?.emit('room:spectate', { roomId: inRoom }) }}
                style={{ borderColor: '#3498db', color: '#3498db', boxShadow: '0 0 20px #3498db' }}
              >
                SPECTATE MATCH
              </button>
            )}

            {isOwner && tournament.root.winnerId && (
              <button 
                className="start-game-btn"
                onClick={() => socket?.emit('game:clear_tournament')}
                style={{ borderColor: '#e74c3c', color: '#e74c3c', boxShadow: '0 0 20px #e74c3c' }}
              >
                FINISH TOURNAMENT
              </button>
            )}

            <button
              className="nav-btn"
              onClick={() => socket?.emit('game:leave_custom_room')}
              style={{ borderColor: '#95a5a6', color: '#95a5a6', marginTop: '20px' }}
            >
              LEAVE ROOM
            </button>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', color: '#fff', textAlign: 'center', lineHeight: '1.5' }}>
            {isPlaying
              ? "GAME IN PROGRESS..."
              : players.length < 2 
                ? "WAITING FOR PLAYERS..." 
                : (isOwner ? "READY TO START!" : "WAITING FOR OWNER...")}
          </h2>
          <div className="panel" style={{ marginTop: '20px', width: '100%', flexDirection: 'column', gap: '15px', alignItems: 'center', minHeight: 'auto' }}>
            {players.map((p, idx) => {
              const isMe = p.socketId === socket?.id;
              const displayName = getPlayerName(p.socketId);
              const roles = [];
              if (idx === 0) roles.push('OWNER');
              if (isMe) roles.push('YOU');
              const roleText = roles.length > 0 ? ` (${roles.join(', ')})` : '';

              return (
                <div key={p.socketId} style={{ fontSize: '12px', color: idx === 0 ? '#f1c40f' : '#ccc', textShadow: isMe ? '2px 2px 0 #000' : 'none', fontWeight: isMe ? 'bold' : 'normal' }}>
                  {displayName.toUpperCase()}{roleText} - WINS: {p.wins}
                </div>
              );
            })}
          </div>

          {isOwner && players.length >= 2 && !tournament && (
            <div style={{ display: 'flex', gap: '20px', marginTop: '30px', justifyContent: 'center' }}>
              <button
                className="start-game-btn"
                onClick={() => {
                  if (isPlaying) return;
                  if (players.length >= 4) {
                    socket?.emit('game:create_tournament');
                  } else {
                    socket?.emit('game:start_custom_room');
                  }
                }}
                disabled={isPlaying}
                style={{ 
                  borderColor: isPlaying ? '#7f8c8d' : '#e74c3c', 
                  color: isPlaying ? '#7f8c8d' : '#e74c3c', 
                  boxShadow: isPlaying ? 'none' : '0 0 20px #e74c3c',
                  cursor: isPlaying ? 'not-allowed' : 'pointer'
                }}
              >
                {isPlaying ? 'IN PROGRESS...' : 'START'}
              </button>
            </div>
          )}

          <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center' }}>
            <button
              className="nav-btn"
              onClick={() => socket?.emit('game:leave_custom_room')}
              style={{ borderColor: '#95a5a6', color: '#95a5a6' }}
            >
              LEAVE ROOM
            </button>
          </div>

          {isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginTop: '30px' }}>
              <span style={{ fontSize: '12px' }}>ROOM ID:</span>
              <input
                type="text"
                value={customRoomId}
                onChange={(e) => setCustomRoomId(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase())}
                minLength={4}
                maxLength={4}
                pattern="[A-Za-z0-9]{4}"
                style={{ 
                  width: '100px', 
                  padding: '8px', 
                  fontSize: '14px', 
                  textAlign: 'center', 
                  borderRadius: '0', 
                  border: '4px solid #555', 
                  backgroundColor: '#000',
                  color: '#fff',
                  fontFamily: "'Press Start 2P', monospace",
                  outline: 'none'
                }}
              />
              <button
                className="nav-btn"
                onClick={handleUpdateRoomId}
                style={{ borderColor: '#3498db', color: '#3498db' }}
              >
                UPDATE ID
              </button>
            </div>
          )}
        </div>
      )}

      {inRoom && (
        <div style={{ marginTop: '20px', textAlign: 'center', lineHeight: 2 }}>
          <div>ROOM ID: {inRoom} / {isPublic ? 'PUBLIC' : 'PRIVATE'}</div>
          {isOwner && <button className="nav-btn" onClick={() => socket?.emit('game:set_room_visibility', { isPublic: !isPublic })}>
            {isPublic ? 'MAKE PRIVATE' : 'MAKE PUBLIC'}
          </button>}
          {!isPublic && <p style={{ fontSize: '10px' }}>Anyone with the room ID can join or spectate.</p>}
        </div>
      )}
      {!inRoom && (
        <button
          className="back-btn"
          onClick={() => {
            if (onBack) {
              onBack();
            } else {
              setAppState('MENU');
            }
          }}
          style={{ marginTop: '40px' }}
        >
          ◀ BACK TO MENU
        </button>
      )}
    </div>
  );
};
