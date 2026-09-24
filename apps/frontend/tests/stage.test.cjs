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
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : { createStage } });
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
