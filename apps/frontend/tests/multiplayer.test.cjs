const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(vsAi = false) {
  const handlers = {}, state = {}, exports = {};
  const sent = [];
  const socket = { id: 'me', connected: true, on: (event, fn) => handlers[event] = fn, disconnect() {}, emit: (...args) => sent.push(args) };
  const refs = { appStateRef: { current: 'CUSTOM_ROOMS' }, gameOverRef: { current: false },
    stageRef: { current: [] }, pendingGarbageRef: { current: [] }, socketRef: { current: null } };
  let localStarts = 0;
  let ready;
  const props = new Proxy({ ...refs, token: null, resetPlayer() {}, resetHold() {}, startGame: (_mode, callback) => { ++localStarts; ready = callback; } }, {
    get: (obj, key) => key in obj ? obj[key] : key.startsWith('set') ? value => {
      const name = key.slice(3);
      state[name] = typeof value === 'function' ? value(state[name]) : value;
    } : null,
  });
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useMultiplayer.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Date, require: name => {
    if (name === 'react') return { useRef: current => ({ current }), useState: initial => [initial, () => {}],
      useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn };
    if (name === 'socket.io-client') return { io: () => socket };
    if (name.includes('gameHelpers')) return { createStage: () => [] };
    if (name.includes('tetrominos')) return { setRandomSeed() {} };
    throw Error(name);
  } });
  const hook = exports.useMultiplayer(props);
  if (vsAi) hook.startVsAi('EXPERT', 0);
  else hook.setupCustomRoomConnection();
  return { state, refs, sent, ready: () => ready?.(), emit: (event, data) => handlers[event](data), localStarts: () => localStarts };
}

test('AI start is acknowledged only when local READY finishes, never for stale matches or sockets', () => {
  const h = mount(true);
  h.emit('match:found', { roomId: 'ai-room', seed: 42, vsAi: true });
  h.emit('game:start', { roomId: 'old-room' });
  assert.equal(h.localStarts(), 0);
  h.emit('game:start', { roomId: 'ai-room' });
  assert.equal(h.localStarts(), 1);
  assert.equal(h.sent.length, 0);
  h.ready();
  assert.equal(h.sent[0][0], 'game:ai_ready');
  assert.equal(h.sent[0][1].roomId, 'ai-room');
  h.refs.socketRef.current = null;
  h.ready();
  assert.equal(h.sent.length, 1);
});

test('READY keeps the server piece/Next and disables input until started', () => {
  const h = mount();
  h.emit('match:found', { roomId: 'room' });
  const ready = { roomId: 'room', started: false, activeMino: { type: 'O', x: 4, y: 18, rotation: 0 }, nextMinos: ['I','T','J','L','S'], isGameOver: false };
  h.emit('game:state', ready);
  assert.equal(h.state.DropTime, null);
  assert.equal(h.state.ServerState, ready);
  h.emit('game:start', { roomId: 'room' });
  h.emit('game:state', { ...ready, started: true });
  assert.deepEqual(h.state.ServerState.activeMino, ready.activeMino);
  assert.deepEqual(h.state.ServerState.nextMinos, ready.nextMinos);
  assert.equal(h.state.DropTime, 1000);
  assert.equal(h.localStarts(), 0);
});

test('partial opponent updates preserve Next/Hold; explicit empty Hold clears it', () => {
  const h = mount();
  h.emit('match:found', { roomId: 'room' });
  const update = { roomId: 'room', playerId: 'other', stage: [], score: 0 };
  h.emit('opponent_board_update', { ...update, next: ['O','I','T','L','S'], hold: 'T' });
  h.emit('opponent_board_update', update);
  assert.equal(h.state.Opponents.other.nextPieceKeys.length, 5);
  assert.equal(h.state.Opponents.other.holdMino, 'T');
  h.emit('opponent_board_update', { ...update, hold: null });
  assert.equal(h.state.Opponents.other.holdMino, null);
});

test('spectating after game over drops old players and ignores their delayed updates', () => {
  const h = mount();
  h.emit('match:found', { roomId: 'old' });
  h.refs.gameOverRef.current = true;
  h.state.Opponents = { oldPlayer: {} };
  h.emit('spectating', { roomId: 'new' });
  for (const playerId of ['a','b']) h.emit('opponent_board_update', { roomId: 'new', playerId, stage: [], score: 0, next: ['O'] });
  h.emit('opponent_board_update', { roomId: 'old', playerId: 'oldPlayer', stage: [], score: 0 });
  assert.deepEqual(Object.keys(h.state.Opponents), ['a','b']);
  assert.equal(h.state.AppState, 'SPECTATING');
  assert.equal(h.state.GameOver, false);
});

test('spectator READY waits for its own start and never accepts a player snapshot', () => {
  const h = mount();
  h.emit('spectating', { roomId: 'new', isStarted: false, players: ['a', 'b'],
    displayNames: { a: 'A', b: 'B', oldPlayer: 'Old' } });
  assert.equal(h.state.AppState, 'VS_SCREEN');
  assert.deepEqual(Object.keys(h.state.Opponents), ['a', 'b']);
  h.emit('game:state', { roomId: 'new', started: true });
  assert.equal(h.state.ServerState, null);
  h.emit('game:start', { roomId: 'old' });
  assert.equal(h.state.AppState, 'VS_SCREEN');
  h.emit('game:start', { roomId: 'new' });
  assert.equal(h.state.AppState, 'SPECTATING');
  assert.equal(h.state.DropTime, null);
  assert.equal(h.localStarts(), 0);
});

test('switching running tournament matches replaces boards rather than appending them', () => {
  const h = mount();
  for (const [roomId, players] of [['first', ['a', 'b']], ['second', ['c', 'd']]]) {
    h.emit('spectating', { roomId, isStarted: true, players,
      displayNames: Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, id])) });
    for (const playerId of players)
      h.emit('opponent_board_update', { roomId, playerId, stage: [], score: 0 });
  }
  h.emit('opponent_board_update', { roomId: 'first', playerId: 'a', stage: [], score: 100 });
  h.emit('game:over', { roomId: 'first', loserId: 'me', winnerId: 'a' });
  assert.deepEqual(Object.keys(h.state.Opponents), ['c', 'd']);
  assert.equal(h.state.GameOver, false);
  assert.equal(h.state.AppState, 'SPECTATING');
});
