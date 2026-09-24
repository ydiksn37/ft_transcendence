const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount() {
  const exports = {}, effects = [], timers = new Map(), navigations = [];
  let id = 0, logouts = 0;
  const jsx = (type, props) => ({ type, props });
  const react = { useState: v => [v, () => {}], useRef: v => ({ current: v }),
    useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/pages/JoinPage.tsx'), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-router-dom') return { useNavigate: () => url => navigations.push(url) };
    if (name.includes('useAuth')) return { useAuth: () => ({ logout: () => logouts++ }) };
    if (name.includes('tetrominos')) return { TETROMINOS: new Proxy({}, { get: () => ({ shape: [[1]] }) }) };
    return {};
  }, window: { addEventListener() {}, removeEventListener() {} },
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: id => timers.delete(id),
  });
  const tree = exports.default();
  const cleanups = effects.map(fn => fn());
  function find(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button') return node;
    return [node.props?.children].flat().map(find).find(Boolean);
  }
  return { click: () => find(tree).props.onClick(), timers, navigations,
    logouts: () => logouts, unmount: () => cleanups.forEach(fn => fn?.()) };
}

test('rapid guest clicks schedule one navigation and logout once', () => {
  const h = mount();
  h.click(); h.click();
  assert.equal(h.logouts(), 1);
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  assert.deepEqual(h.navigations, ['/menu']);
});

test('leaving JoinPage cancels pending guest navigation', () => {
  const h = mount(); h.click(); h.unmount();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.navigations, []);
});
