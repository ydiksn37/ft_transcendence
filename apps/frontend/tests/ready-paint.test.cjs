const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(hidden = false) {
  const frames = new Map(), listeners = new Set(), exports = {};
  let id = 0, calls = 0;
  const document = { hidden,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn) };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/lib/afterVisiblePaint.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, document,
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id) });
  const cancel = exports.afterVisiblePaint(() => calls++);
  return { cancel, calls: () => calls,
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    visible(value) { document.hidden = !value; [...listeners].forEach(fn => fn()); } };
}

test('does not acknowledge before the GO frame has had an opportunity to paint', () => {
  const h = setup();
  assert.equal(h.calls(), 0);
  h.frame();
  assert.equal(h.calls(), 0);
  h.frame(); h.frame();
  assert.equal(h.calls(), 1);
});

test('hidden tabs wait for a fresh visible paint before allowing AI to start', () => {
  const h = setup(true);
  h.frame(); h.frame();
  assert.equal(h.calls(), 0);
  h.visible(true); h.frame();
  h.visible(false); h.frame();
  assert.equal(h.calls(), 0);
  h.visible(true); h.frame(); h.frame();
  assert.equal(h.calls(), 1);
});

test('quit, restart and unmount cancel the pending acknowledgement', () => {
  const h = setup();
  h.frame(); h.cancel(); h.frame();
  h.visible(false); h.visible(true); h.frame(); h.frame();
  assert.equal(h.calls(), 0);
});
