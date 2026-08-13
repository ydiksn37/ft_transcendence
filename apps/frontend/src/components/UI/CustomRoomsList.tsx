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

  useEffect(() => {
    if (!socket) return;

    socket.emit('game:get_custom_rooms');

    const handleRoomsUpdated = (updatedRooms: Room[]) => {
      setRooms(updatedRooms);
    };

    const handleRoomCreated = (data: { roomId: string; name: string }) => {
      setInRoom(data.roomId);
      setCustomRoomId(data.roomId);
    };

    const handleMatchFound = () => {
      // 試合が始まれば TetrisGame 側でアプリ状態が ONLINE_1V1 に遷移するので、ここでは何もしない
    };

    const handleError = (err: { message: string }) => {
      alert(err.message);
    };

    const handleRoomUpdated = (data: { oldId: string; newId: string }) => {
      setInRoom(data.newId);
      setCustomRoomId(data.newId);
    };

    socket.on('custom_rooms_updated', handleRoomsUpdated);
    socket.on('custom_room_created', handleRoomCreated);
    socket.on('custom_room_id_updated', handleRoomUpdated);
    socket.on('match:found', handleMatchFound);
    socket.on('error', handleError);

    return () => {
      socket.off('custom_rooms_updated', handleRoomsUpdated);
      socket.off('custom_room_created', handleRoomCreated);
      socket.off('custom_room_id_updated', handleRoomUpdated);
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
          <h2>Waiting for opponent...</h2>
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
