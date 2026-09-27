const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, require) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require });
  return exports;
}
const shapes = load('utils/tetrominos.ts');
const picker = load('components/UI/MinoSkinPicker.tsx', name => {
  if (name === 'react') return { Fragment: 'Fragment' };
  if (name === 'react/jsx-runtime') { const jsx = (type, props) => ({ type, props }); return { jsx, jsxs: jsx }; }
  if (name === '@pixi/react') return { Stage: 'Stage', Text: 'Text' };
  if (name === 'pixi.js') return { TextStyle: class {} };
  if (name === '../Cell') return { default: 'Cell' };
  if (name.includes('tetrominos')) return shapes;
  throw Error(name);
});
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}
for (const skin of ['RETRO', 'NEON', 'MINIMAL']) test(`${skin} previews all seven minos with the real Cell component`, () => {
  const selections = [];
  const tree = nodes(picker.MinoSkinPicker({ value: skin, onChange: next => selections.push(next) }));
  assert.equal(tree.filter(n => n.type === 'Stage').length, 1);
  const cells = tree.filter(n => n.type === 'Cell');
  assert.equal(cells.length, 28);
  for (const piece of 'IJLOSTZ') assert.equal(cells.filter(n => n.props.type === piece).length, 4);
  assert.ok(cells.every(n => n.props.skin === skin));
  const buttons = tree.filter(n => n.type === 'button');
  assert.equal(buttons.filter(n => n.props['aria-pressed']).length, 1);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(selections, ['RETRO', 'NEON', 'MINIMAL']);
});
