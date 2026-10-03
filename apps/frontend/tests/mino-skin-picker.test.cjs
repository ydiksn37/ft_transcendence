const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, require) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
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

test('CONFIG contains every appearance control and forwards changes to saved settings', () => {
  let stateCall = 0;
  const react = { useEffect() {}, useState: init => [stateCall++ === 0 ? 'DISPLAY' : init(), () => {}] };
  const { Config } = load('components/UI/Config.tsx', name => {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react/jsx-runtime') {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx };
    }
    if (name.includes('soundManager')) return { soundManager: {} };
    if (name.includes('MinoSkinPicker')) return { MinoSkinPicker: 'MinoSkinPicker' };
    if (name.includes('DisplayPreview')) return { DisplayPreview: 'DisplayPreview' };
    if (name.endsWith('.css')) return {};
    throw Error(name);
  });
  const changes = [];
  const tree = nodes(Config({
    minoSkin: 'RETRO', setMinoSkin: value => changes.push(['skin', value]),
    showGhost: true, setShowGhost: value => changes.push(['ghost', value]),
    displayTheme: 'CYBER', setDisplayTheme: value => changes.push(['theme', value]),
    mapStyle: 'GRID', setMapStyle: value => changes.push(['map', value]),
    backgroundStyle: 'MATRIX', setBackgroundStyle: value => changes.push(['background', value]),
    tuning: { arr: 0, das: 100, dcd: 0, sdf: 6 }, volume: { se: 1, bgm: 1 },
    keyConfig: {}, listeningAction: null,
  }));
  tree.find(n => n.type === 'MinoSkinPicker').props.onChange('MINIMAL');
  const ghost = tree.find(n => n.type === 'input' && n.props.type === 'checkbox');
  assert.equal(ghost.props.checked, true);
  ghost.props.onChange({ target: { checked: false } });
  const selects = tree.filter(n => n.type === 'select');
  assert.deepEqual(selects.map(n => n.props.value), ['CYBER', 'GRID', 'MATRIX']);
  for (const [index, value] of ['ARCADE', 'ARENA', 'STARS'].entries()) {
    assert.equal(nodes(selects[index].props.children).filter(n => n.type === 'option').length, 3);
    selects[index].props.onChange({ target: { value } });
  }
  assert.deepEqual(changes, [
    ['skin', 'MINIMAL'], ['ghost', false], ['theme', 'ARCADE'],
    ['map', 'ARENA'], ['background', 'STARS'],
  ]);
});

test('CONFIG tabs show only their category and cancel key rebinding when switched', () => {
  const state = [];
  let cursor = 0;
  const react = { useEffect() {}, useState(init) {
    const index = cursor++;
    if (!(index in state)) state[index] = init();
    return [state[index], value => { state[index] = value; }];
  } };
  const { Config } = load('components/UI/Config.tsx', name => {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react/jsx-runtime') {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx };
    }
    if (name.includes('soundManager')) return { soundManager: {} };
    if (name.includes('MinoSkinPicker')) return { MinoSkinPicker: 'MinoSkinPicker' };
    if (name.includes('DisplayPreview')) return { DisplayPreview: 'DisplayPreview' };
    if (name.endsWith('.css')) return {};
    throw Error(name);
  });
  const cancellations = [];
  const props = {
    tuning: { arr: 0, das: 100, dcd: 0, sdf: 6 }, volume: { se: 1, bgm: 1 },
    keyConfig: {}, listeningAction: null, setListeningAction: value => cancellations.push(value),
  };
  const render = () => { cursor = 0; return nodes(Config(props)); };
  let tree = render();
  assert.deepEqual(tree.filter(n => n.props?.role === 'tab').map(n => n.props.children),
    ['CONTROLS', 'DISPLAY', 'SOUND']);
  for (const category of ['DISPLAY', 'SOUND', 'CONTROLS']) {
    tree.find(n => n.props?.role === 'tab' && n.props.children === category).props.onClick();
    tree = render();
    const selected = tree.filter(n => n.props?.role === 'tab' && n.props['aria-selected']);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].props.children, category);
    assert.equal(tree.find(n => n.props?.role === 'tabpanel').props.id, `config-panel-${category}`);
    assert.equal(tree.filter(n => n.type === 'DisplayPreview').length, category === 'DISPLAY' ? 1 : 0);
    assert.equal(tree.filter(n => n.type === 'input' && n.props.type === 'number').length, category === 'CONTROLS' ? 4 : 0);
    assert.equal(tree.filter(n => n.type === 'input' && n.props.type === 'range').length, category === 'SOUND' ? 2 : 0);
  }
  assert.deepEqual(cancellations, [null, null, null]);
});

test('display preview uses real board/ghost geometry and all appearance selections', () => {
  const helpers = load('utils/gameHelpers.ts');
  const appearance = load('utils/gameAppearance.ts');
  const { DisplayPreview } = load('components/UI/DisplayPreview.tsx', name => {
    if (name === 'react/jsx-runtime') {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx };
    }
    if (name === '@pixi/react') return { Container: 'Container', Stage: 'Stage' };
    if (name === '../GameBoard') return { default: 'GameBoard' };
    if (name.includes('gameHelpers')) return helpers;
    if (name.includes('tetrominos')) return shapes;
    if (name.includes('gameAppearance')) return appearance;
    if (name.endsWith('.png')) return { default: 'fixture.png' };
    if (name.endsWith('.css')) return {};
    throw Error(name);
  });
  for (const backgroundStyle of ['MATRIX', 'STARS', 'SOLID']) {
    for (const mapStyle of ['GRID', 'VOID', 'ARENA']) {
      for (const showGhost of [true, false]) {
        const tree = nodes(DisplayPreview({ minoSkin: 'NEON', displayTheme: 'MONO', mapStyle, backgroundStyle, showGhost }));
        const board = tree.find(n => n.type === 'GameBoard').props;
        assert.equal(board.showGhost, showGhost);
        assert.equal(board.minoSkin, 'NEON');
        assert.equal(board.mapStyle, mapStyle);
        assert.ok(board.ghostY > board.player.pos.y);
        assert.equal(helpers.checkCollision({ ...board.player, pos: { ...board.player.pos, y: board.ghostY } }, board.stage, { x: 0, y: 1 }), true);
        assert.ok(tree[0].props.className.includes(`map-${mapStyle.toLowerCase()}`));
        assert.equal(tree[0].props.style.backgroundImage, appearance.gameBackgroundImage(backgroundStyle, 'fixture.png'));
      }
    }
  }
});
