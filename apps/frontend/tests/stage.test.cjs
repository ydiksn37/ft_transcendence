const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount() {
  const slots = [], exports = {};
  let cursor = 0, effect, resets = 0;
  const createStage = () => Array.from({ length: 40 }, () => Array.from({ length: 10 }, () => [0, 'clear']));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = next; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn) { effect = fn; },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/hooks/useStage.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : name === '@transcendence/shared' ? require('@transcendence/shared') : { createStage } });
  return {
    render(player, disableSweep = false) {
      cursor = 0;
      return exports.useStage(player, () => resets++, () => false, disableSweep);
    },
    replay() { effect(); },
    resets: () => resets,
  };
}
const piece = spawnCount => ({ spawnCount, collided: true, pos: { x: 0, y: 39 },
  tetromino: [['I', 'I', 'I', 'I']], lastAction: 'drop', rotationIndex: 0, kickIndex: 0 });

test('effect replay and callback changes do not lock or consume Next twice', () => {
  const h = mount(), p = piece(1);
  const initial = h.render(p);
  for (let x = 4; x < 10; x++) initial[3].current[39][x] = ['J', 'merged'];
  h.replay(); h.replay();
  h.render({ ...p }); h.replay();
  const result = h.render(p);
  assert.equal(h.resets(), 1);
  assert.equal(result[2].id, 1);
  assert.equal(result[2].lines, 1);
  assert.equal(result[2].perfectClear, true);
  assert.ok(result[3].current.every(row => row.every(cell => cell[0] === 0)));
  h.render(piece(2)); h.replay();
  assert.equal(h.resets(), 2);
  assert.equal(h.render(piece(2))[2].id, 2);
});

test('disableSweep preserves complete rows without re-locking on configuration change', () => {
  const h = mount(), p = piece(5);
  const initial = h.render(p, true);
  for (let x = 4; x < 10; x++) initial[3].current[39][x] = ['J', 'merged'];
  h.replay();
  assert.equal(h.render(p, true)[2].lines, 0);
  h.render(p, false); h.replay();
  assert.equal(h.resets(), 1);
  assert.ok(h.render(p)[3].current[39].every(cell => cell[1] === 'merged'));
});

for (const type of ['I', 'J', 'L', 'S', 'Z']) test(`${type} spin clears are counted once for solo results`, () => {
  const shared = require('@transcendence/shared');
  const shape = shared.TETROMINO_SHAPES[type][0];
  const maxRow = Math.max(...shape.map(([row]) => row));
  const maxCol = Math.max(...shape.map(([, col]) => col));
  const matrix = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(0));
  shape.forEach(([row, col]) => { matrix[row][col] = type; });
  const y = 39 - maxRow;
  const p = { spawnCount: 1, collided: true, pos: { x: 3, y }, tetromino: matrix, lastAction: 'rotate', rotationIndex: 0, kickIndex: 0 };
  const h = mount();
  const initial = h.render(p);
  const board = initial[3].current;
  for (const row of new Set(shape.map(([row]) => row + y))) board[row] = Array.from({ length: 10 }, () => ['X', 'merged']);
  shape.forEach(([row, col]) => { board[row + y][col + 3] = [0, 'clear']; });
  const [top, left] = shape.reduce((a, b) => a[0] < b[0] ? a : b);
  board[y + top - 1][left + 3] = ['X', 'merged'];
  h.replay(); h.replay();
  const result = h.render(p);
  assert.equal(result[4].current.otherSpins[type], 1);
  assert.equal(result[4].current.tSpins, 0);
  assert.ok(result[2].lines > 0);
});
