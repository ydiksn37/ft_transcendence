// Exercise the real input hook with deterministic timers/event listeners.
// No browser or extra test dependencies are required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(overrides = {}) {
  const effects = [], cleanups = [], listeners = new Map(), timers = new Map();
  let nextId = 0, attempts = 0, drops = 0, grounded = true;
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useKeyboardControls.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, {
    exports, window,
    setInterval: fn => { const id = ++nextId; timers.set(id, fn); return id; },
    clearInterval: id => timers.delete(id),
    setTimeout: () => ++nextId, clearTimeout: () => {},
    require: name => {
      if (name === 'react') return {
        useRef: current => ({ current }), useCallback: fn => fn,
        useEffect: fn => effects.push(fn),
      };
      if (name.includes('soundManager')) return { soundManager: { playSe() {} } };
      throw new Error(`unexpected import ${name}`);
    },
  });
  const ref = current => ({ current });
  const appStateRef = ref('ONLINE_1V1');
  const props = {
    player: { tetromino: [[0]] }, stageRef: ref([[]]),
    tuningRef: ref({ arr: 33, das: 133, dcd: 0, sdf: 6 }),
    keyConfigRef: ref({ left: 'ArrowLeft', right: 'ArrowRight', softDrop: 'ArrowDown' }),
    gameOver: false, dropTime: 1000, appStateRef, countdownRef: ref(null),
    listeningActionRef: ref(null), socketRef: ref(null),
    movePlayerHorizontal: () => { grounded = false; },
    softDrop: () => { ++attempts; if (!grounded) ++drops; },
    hardDrop() {}, playerRotate() {}, playerHold() {}, startGame() {},
    setKeyConfig() {}, setListeningAction() {}, setSocket() {}, setIsWaiting() {}, setDropTime() {}, quitGame() {},
    ...overrides,
  };
  const hook = exports.useKeyboardControls(props);
  effects.forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return {
    hook, appStateRef,
    key: (type, code, repeat = false) => listeners.get(type)({ code, repeat, preventDefault() {} }),
    tick: () => [...timers.values()].forEach(fn => fn()),
    blur: () => listeners.get('blur')(),
    unmount: () => cleanups.forEach(fn => fn()),
    counts: () => ({ attempts, drops, timers: timers.size }),
  };
}

test('held soft drop resumes after sideways movement without another Down event', () => {
  const h = mount();
  h.key('keydown', 'ArrowDown');
  h.tick();
  assert.equal(h.counts().drops, 0);
  h.key('keydown', 'ArrowLeft');
  h.tick();
  assert.equal(h.counts().drops, 1);
  h.key('keyup', 'ArrowLeft');
  h.tick();
  assert.equal(h.counts().drops, 2);
  h.key('keyup', 'ArrowDown');
  h.tick();
  assert.equal(h.counts().drops, 2);
  assert.equal(h.counts().timers, 0);
  h.unmount();
});

test('native key-repeat does not add extra soft-drop bursts', () => {
  const h = mount();
  h.key('keydown', 'ArrowDown');
  h.key('keydown', 'ArrowDown', true);
  assert.equal(h.counts().attempts, 1);
  h.tick();
  assert.equal(h.counts().attempts, 2);
  h.unmount();
  assert.equal(h.counts().timers, 0);
});

test('held soft drop follows the next server-confirmed piece', () => {
  let pieceId = 41;
  const receivedPieceIds = [];
  const h = mount({
    getActivePieceId: () => pieceId,
    softDrop: activePieceId => receivedPieceIds.push(activePieceId),
  });

  h.key('keydown', 'ArrowDown');
  pieceId = 42;
  h.tick();

  assert.deepEqual(receivedPieceIds, [41, 42]);
  h.key('keyup', 'ArrowDown');
  h.unmount();
});

test('blur releases held soft drop and spectator mode sends no repeats', () => {
  const h = mount();
  h.key('keydown', 'ArrowDown');
  h.appStateRef.current = 'SPECTATING';
  h.tick();
  assert.equal(h.counts().attempts, 1);
  h.blur();
  assert.equal(h.hook.heldKeys.current.size, 0);
  assert.equal(h.counts().timers, 0);
  h.unmount();
});

test('spectator exit works without disconnecting or forfeiting, including after game over', () => {
  for (const gameOver of [false, true]) {
    let quits = 0;
    const h = mount({
      gameOver, dropTime: null,
      keyConfigRef: { current: { quitToMenu: 'Escape', restart: 'KeyQ' } },
      socketRef: { current: {
        emit() { assert.fail('spectating must not forfeit'); },
        disconnect() { assert.fail('keep the custom room connection'); },
      } },
      quitGame() { ++quits; },
      startGame() { assert.fail('spectators must not restart'); },
      hardDrop() { assert.fail('spectators must not play'); },
    });
    h.appStateRef.current = 'SPECTATING';
    h.key('keydown', 'KeyQ');
    h.key('keydown', 'ArrowDown');
    h.key('keydown', 'Escape');
    h.key('keydown', 'Escape', true);
    assert.equal(quits, 1);
    assert.equal(h.counts().attempts, 0);
    h.unmount();
  }
});

test('spectator exit respects a customized quit key', () => {
  let quits = 0;
  const h = mount({
    keyConfigRef: { current: { quitToMenu: 'KeyX' } },
    quitGame() { ++quits; },
  });
  h.appStateRef.current = 'SPECTATING';
  h.key('keydown', 'Escape');
  assert.equal(quits, 0);
  h.key('keydown', 'KeyX');
  assert.equal(quits, 1);
  h.unmount();
});
