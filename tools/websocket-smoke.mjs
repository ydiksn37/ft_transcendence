import { io } from 'socket.io-client';

const baseUrl = process.env.WS_BASE_URL ?? 'https://localhost:8443';
const timeoutMs = 8_000;

function once(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event} on ${socket.id ?? 'unconnected socket'}`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function guestSocket(auth = { guestGameSession: true }) {
  return io(baseUrl, {
    autoConnect: false,
    transports: ['websocket'],
    rejectUnauthorized: false,
    forceNew: true,
    auth,
  });
}

async function connectGuest(auth) {
  const socket = guestSocket(auth);
  const session = await new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('session:ready', onReady);
      socket.off('connect_error', onError);
    };
    const onReady = payload => {
      cleanup();
      resolve(payload);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out connecting guest socket'));
    }, timeoutMs);
    socket.on('session:ready', onReady);
    socket.on('connect_error', onError);
    socket.connect();
  });
  return { socket, session };
}

const clients = [];
try {
  const guests = await Promise.all(Array.from({ length: 4 }, () => connectGuest()));
  clients.push(...guests.map(({ socket }) => socket));
  const sessionIds = new Set(guests.map(({ session }) => session.guestSessionId));
  if (sessionIds.size !== 4) throw new Error('Guest sessions were not unique');

  const invalidPayload = once(guests[0].socket, 'error', payload => payload?.code === 'INVALID_PAYLOAD');
  guests[0].socket.emit('game:create_custom_room', { name: 42 });
  await invalidPayload;

  const pair = async (first, second) => {
    const firstMatch = once(first, 'match:found');
    const secondMatch = once(second, 'match:found');
    first.emit('match:join_queue');
    second.emit('match:join_queue');
    const [a, b] = await Promise.all([firstMatch, secondMatch]);
    if (a.roomId !== b.roomId) throw new Error('A matched pair received different rooms');
    if (new Set(a.players).size !== 2) throw new Error('A random match did not contain two players');
    return a;
  };

  const firstMatch = await pair(guests[0].socket, guests[1].socket);
  const secondMatch = await pair(guests[2].socket, guests[3].socket);
  if (firstMatch.roomId === secondMatch.roomId) throw new Error('Concurrent matches shared a room');

  const original = guests[0];
  original.socket.disconnect();
  await new Promise(resolve => setTimeout(resolve, 100));
  const resumedSocket = guestSocket({
    guestGameSession: true,
    guestSessionId: original.session.guestSessionId,
    reconnectToken: original.session.reconnectToken,
  });
  clients.push(resumedSocket);
  const resumedReady = once(resumedSocket, 'session:ready');
  const restoredMatch = once(resumedSocket, 'match:found');
  const restoredState = once(
    resumedSocket,
    'game:state',
    payload => payload?.roomId === firstMatch.roomId,
  );
  resumedSocket.connect();
  const [session, match, state] = await Promise.all([
    resumedReady,
    restoredMatch,
    restoredState,
  ]);
  if (!session.resumed) throw new Error('Reconnect token did not resume the guest session');
  if (match.roomId !== firstMatch.roomId) throw new Error('Reconnect restored the wrong room');
  if (!Array.isArray(state.board) || state.board.length === 0) {
    throw new Error('Reconnect did not restore the board');
  }
  if (!Array.isArray(state.nextMinos) || state.nextMinos.length === 0) {
    throw new Error('Reconnect did not restore the next queue');
  }
  if (!Object.hasOwn(state, 'holdMino')) throw new Error('Reconnect did not restore hold');
  if (!Number.isInteger(state.garbageQueue)) throw new Error('Reconnect did not restore garbage');
  if (typeof state.score !== 'number') throw new Error('Reconnect did not restore score');

  const customGuests = await Promise.all(Array.from({ length: 4 }, () => connectGuest()));
  clients.push(...customGuests.map(({ socket }) => socket));
  const [owner, second, third, spectator] = customGuests.map(({ socket }) => socket);
  const createdRoom = once(owner, 'custom_room_created');
  owner.emit('game:create_custom_room', { name: 'Socket smoke room' });
  const customRoom = await createdRoom;
  for (const [index, player] of [second, third].entries()) {
    const joined = once(
      player,
      'custom_room_state',
      payload => payload?.roomId === customRoom.roomId && payload?.players?.length === index + 2,
    );
    player.emit('game:join_custom_room', { roomId: customRoom.roomId });
    await joined;
  }
  const customMatches = [owner, second, third].map(player =>
    once(
      player,
      'match:found',
      payload => payload?.roomId === customRoom.roomId,
    ),
  );
  owner.emit('game:start_custom_room');
  const threePlayerMatches = await Promise.all(customMatches);
  if (threePlayerMatches.some(match => new Set(match.players).size !== 3)) {
    throw new Error('Three-player custom match did not contain exactly three players');
  }
  const spectating = once(
    spectator,
    'spectating',
    payload => payload?.roomId === customRoom.roomId,
  );
  const spectatorBoard = once(spectator, 'game:opponent');
  spectator.emit('room:spectate', { roomId: customRoom.roomId });
  await Promise.all([spectating, spectatorBoard]);

  console.log(`PASS 4 unique guest sessions`);
  console.log(`PASS invalid WebSocket payload rejected`);
  console.log(`PASS 2 concurrent matches remained isolated`);
  console.log(`PASS reconnect restored room and full player state ${firstMatch.roomId}`);
  console.log(`PASS 3-player custom match and live spectator ${customRoom.roomId}`);
} finally {
  for (const socket of clients) socket.disconnect();
}
