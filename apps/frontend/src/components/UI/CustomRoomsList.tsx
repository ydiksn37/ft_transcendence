import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { TournamentBracket } from './TournamentBracket';
import type { Tournament } from '../../types/tournament';

type Room = {
  roomId: string;
  name: string;
  ownerId: string;
};

type CustomRoomsListProps = {
  socket: Socket | null;
  setAppState: (state: 'MENU') => void;
  onBack?: () => void;
};

export const CustomRoomsList: React.FC<CustomRoomsListProps> = ({ socket, setAppState, onBack }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [customRoomId, setCustomRoomId] = useState('');
  const [inRoom, setInRoom] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [players, setPlayers] = useState<{ socketId: string; userId: string | null; username: string | null; wins: number }[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.emit('game:get_custom_rooms');
    socket.emit('game:request_custom_room_state');

    const handleRoomsUpdated = (updatedRooms: Room[]) => {
      setRooms(updatedRooms);
    };

    const handleRoomState = (data: { inRoom: boolean; roomId?: string; isOwner?: boolean; players?: any[]; isPlaying?: boolean; tournament?: Tournament }) => {
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

    const handleRoomCreated = (data: { roomId: string; name: string, players: any[] }) => {
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

    return () => {
      socket.off('custom_rooms_updated', handleRoomsUpdated);
      socket.off('custom_room_created', handleRoomCreated);
      socket.off('custom_room_id_updated', handleRoomUpdated);
      socket.off('custom_room_state', handleRoomState);
      socket.off('custom_room_players_updated', handleRoomUpdate);
      socket.off('match:found', handleMatchFound);
      socket.off('tournament_state', handleTournamentState);
      socket.off('error', handleError);
    };
  }, [socket]);

  const handleCreateRoom = () => {
    if (socket) {
      socket.emit('game:create_custom_room', { name: newRoomName });
    }
  };

  const handleUpdateRoomId = () => {
    if (socket && inRoom && customRoomId) {
      socket.emit('game:update_custom_room_id', { newRoomId: customRoomId });
    }
  };

  const handleJoinRoom = (roomId: string) => {
    if (socket) {
      socket.emit('game:join_custom_room', { roomId });
      setInRoom(roomId);
      setCustomRoomId(roomId);
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
    return p.username ? p.username : (p.userId ? p.userId : `Player ${idx + 1}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px' }}>
      <h1 style={{ marginBottom: '20px', color: '#3498db' }}>Custom Rooms</h1>
      
      {!inRoom ? (
        <>
          <div style={{ marginBottom: '40px', display: 'flex', gap: '10px' }}>

            <input 
              type="text" 
              placeholder="Room Name (Optional)" 
              value={newRoomName} 
              onChange={(e) => setNewRoomName(e.target.value)}
              style={{ width: '200px', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
            />
            <button 
              onClick={handleCreateRoom}
              style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '4px' }}
            >
              Create Room
            </button>
          </div>

          <div style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rooms.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#aaa' }}>No rooms available.</p>
            ) : (
              rooms.map((room) => (
                <div key={room.roomId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '18px' }}>{room.name || `Room ${room.roomId}`}</span>
                    <span style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>ID: {room.roomId}</span>
                  </div>
                  <button 
                    onClick={() => handleJoinRoom(room.roomId)}
                    style={{ padding: '8px 15px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px' }}
                  >
                    Join
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div style={{ marginTop: '50px', textAlign: 'center' }}>
          <h2>
            {isPlaying
              ? "Game in progress..."
              : players.length < 2 
                ? "Waiting for players..." 
                : (isOwner ? "Ready to start!" : "Waiting for owner to start...")}
          </h2>
          <div style={{ marginTop: '20px', fontSize: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            {players.map((p, idx) => {
              const isMe = p.socketId === socket?.id;
              const displayName = getPlayerName(p.socketId);
              const roles = [];
              if (idx === 0) roles.push('Owner');
              if (isMe) roles.push('You');
              const roleText = roles.length > 0 ? ` (${roles.join(', ')})` : '';

              return (
                <div key={p.socketId} style={{ color: idx === 0 ? '#f1c40f' : '#ccc', fontWeight: isMe ? 'bold' : 'normal' }}>
                  {displayName}{roleText} - Wins: {p.wins}
                </div>
              );
            })}
          </div>
          
          {tournament && (
            <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#111', borderRadius: '8px', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
              <TournamentBracket 
                node={tournament.root} 

                getPlayerName={getPlayerName} 
              />
            </div>
          )}

          {isOwner && players.length >= 2 && !tournament && (
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  if (isPlaying) return;
                  if (players.length >= 4) {
                    socket?.emit('game:create_tournament');
                  } else {
                    socket?.emit('game:start_custom_room');
                  }
                }}
                disabled={isPlaying}
                style={{ padding: '15px 30px', fontSize: '20px', cursor: isPlaying ? 'not-allowed' : 'pointer', backgroundColor: isPlaying ? '#7f8c8d' : '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
              >
                {isPlaying ? 'GAME IN PROGRESS...' : 'START'}
              </button>
            </div>
          )}

          {tournament && !isPlaying && !tournament.root.winnerId && (
             <div style={{ marginTop: '20px', padding: '15px 30px', fontSize: '20px', backgroundColor: '#34495e', color: '#f1c40f', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', animation: 'pulse 1.5s infinite' }}>
               NEXT MATCH STARTING SOON...
             </div>
          )}

          {tournament && isPlaying && (
             <button 
               onClick={() => { socket?.emit('room:spectate', { roomId: inRoom }) }}
               style={{ marginTop: '20px', padding: '15px 30px', fontSize: '20px', cursor: 'pointer', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
             >
               SPECTATE MATCH
             </button>
          )}

          {isOwner && tournament && tournament.root.winnerId && (
             <button 
               onClick={() => socket?.emit('game:clear_tournament')}
               style={{ marginTop: '20px', padding: '15px 30px', fontSize: '20px', cursor: 'pointer', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
             >
               FINISH TOURNAMENT
             </button>
          )}

          {isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
              <span>Room ID:</span>
              <input
                type="text"
                value={customRoomId}
                onChange={(e) => setCustomRoomId(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase())}
                style={{ width: '80px', padding: '5px', fontSize: '18px', textAlign: 'center', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
              />
              <button
                onClick={handleUpdateRoomId}
                style={{ padding: '6px 12px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px' }}
              >
                Update ID
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => {
          if (onBack) {
            onBack();
          } else {
            setAppState('MENU');
          }
        }}
        style={{ marginTop: '40px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '8px' }}
      >
        Back to Menu
      </button>
    </div>
  );
};
