import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

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
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [ownerWins, setOwnerWins] = useState(0);
  const [guestWins, setGuestWins] = useState(0);

  useEffect(() => {
    if (!socket) return;

    socket.emit('game:get_custom_rooms');
    socket.emit('game:request_custom_room_state');

    const handleRoomsUpdated = (updatedRooms: Room[]) => {
      setRooms(updatedRooms);
    };

    const handleRoomState = (data: any) => {
      if (data.inRoom) {
        setInRoom(data.roomId);
        setCustomRoomId(data.roomId);
        setIsOwner(data.isOwner);
        setOpponentJoined(data.opponentJoined);
        setOwnerWins(data.ownerWins);
        setGuestWins(data.guestWins);
      }
    };

    const handleRoomCreated = (data: { roomId: string; name: string }) => {
      setInRoom(data.roomId);
      setCustomRoomId(data.roomId);
      setIsOwner(true);
      setOpponentJoined(false);
    };

    const handleOpponentJoined = (data?: { ownerWins: number; guestWins: number }) => {
      setOpponentJoined(true);
      if (data) {
        setOwnerWins(data.ownerWins);
        setGuestWins(data.guestWins);
      }
    };

    const handleMatchFound = () => {
      // 試合が始まれば TetrisGame 側でアプリ状態が ONLINE_1V1 に遷移するので、ここでは何もしない
    };

    const handleError = (err: { message: string }) => {
      alert(err.message);
      setInRoom(null);
      setIsOwner(false);
      setOpponentJoined(false);
    };

    const handleRoomUpdated = (data: { oldId: string; newId: string }) => {
      setInRoom(data.newId);
      setCustomRoomId(data.newId);
    };

    socket.on('custom_rooms_updated', handleRoomsUpdated);
    socket.on('custom_room_created', handleRoomCreated);
    socket.on('custom_room_id_updated', handleRoomUpdated);
    socket.on('custom_room_state', handleRoomState);
    socket.on('custom_room_opponent_joined', handleOpponentJoined);
    socket.on('match:found', handleMatchFound);
    socket.on('error', handleError);

    return () => {
      socket.off('custom_rooms_updated', handleRoomsUpdated);
      socket.off('custom_room_created', handleRoomCreated);
      socket.off('custom_room_id_updated', handleRoomUpdated);
      socket.off('custom_room_state', handleRoomState);
      socket.off('custom_room_opponent_joined', handleOpponentJoined);
      socket.off('match:found', handleMatchFound);
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
            {!opponentJoined 
              ? "Waiting for opponent..." 
              : (isOwner ? "Opponent joined!" : "Waiting for owner to start...")}
          </h2>
          {opponentJoined && (
            <div style={{ marginTop: '20px', fontSize: '24px', fontWeight: 'bold', display: 'flex', gap: '30px', justifyContent: 'center' }}>
              <div style={{ color: isOwner ? '#f1c40f' : '#ccc' }}>Owner Wins: {ownerWins}</div>
              <div style={{ color: !isOwner ? '#f1c40f' : '#ccc' }}>Guest Wins: {guestWins}</div>
            </div>
          )}
          
          {isOwner && opponentJoined && (
            <button 
              onClick={() => socket?.emit('game:start_custom_room')}
              style={{ marginTop: '20px', padding: '15px 30px', fontSize: '20px', cursor: 'pointer', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
            >
              START GAME
            </button>
          )}

          {isOwner && !opponentJoined && (
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
