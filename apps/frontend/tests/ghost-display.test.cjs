const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const output = {};
const jsx = (type, props) => ({ type, props });
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/GameBoard.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: output, require: name => {
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
  if (name === 'react') return { useCallback: fn => fn };
  if (name === '@pixi/react') return { Container: 'Container', Graphics: 'Graphics' };
  if (name === './Cell') return { default: 'Cell' };
  if (name.includes('gameHelpers')) return { checkCollision: () => false };
  throw new Error(name);
} });
function cells(node) {
  if (Array.isArray(node)) return node.flatMap(cells);
  if (!node || typeof node !== 'object') return [];
  return node.type === 'Cell' ? [node.props] : cells(node.props?.children);
}
test('hiding ghost affects only ghost cells, not locked or active pieces', () => {
  const props = { stage: [[['I', 'merged']]], player: { pos: { x: 0, y: 0 }, tetromino: [['T']], collided: false }, ghostY: 4 };
  const visible = cells(output.default(props));
  const hidden = cells(output.default({ ...props, showGhost: false }));
  assert.equal(visible.filter(cell => cell.status === 'ghost').length, 1);
  assert.equal(hidden.filter(cell => cell.status === 'ghost').length, 0);
  assert.equal(JSON.stringify(hidden), JSON.stringify(visible.filter(cell => cell.status !== 'ghost')));
});

test('selected skins propagate to locked, ghost and active cells', () => {
  for (const minoSkin of ['NEON', 'RETRO', 'MINIMAL']) {
    const props = { stage: [[['I', 'merged']]], player: { pos: { x: 0, y: 0 }, tetromino: [['T']], collided: false }, ghostY: 4, minoSkin };
    const rendered = cells(output.default(props));
    assert.equal(rendered.length, 3);
    assert.ok(rendered.every(cell => cell.skin === minoSkin));
  }
});
