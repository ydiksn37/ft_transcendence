const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(refresh, visibility = 'visible') {
  const exports = {};
  let tick, listener, cleared = false;
  const document = { visibilityState: visibility,
    addEventListener: (_, fn) => { listener = fn; },
    removeEventListener: (_, fn) => { if (listener === fn) listener = null; },
  };
  const window = { setInterval: (fn, ms) => { assert.equal(ms, 15000); tick = fn; return 1; },
    clearInterval: id => { assert.equal(id, 1); cleared = true; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/visibleRefresh.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, document, window });
  const stop = exports.startVisibleRefresh(refresh);
  return { stop, tick: () => tick(), visibility: value => { document.visibilityState = value; listener?.(); }, cleaned: () => cleared && !listener };
}

test('refreshes initially, skips overlap/hidden tabs, and resumes on visibility', async () => {
  let calls = 0, finish;
  const h = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  assert.equal(calls, 1);
  h.tick(); assert.equal(calls, 1);
  finish(); await new Promise(setImmediate);
  h.visibility('hidden'); h.tick(); assert.equal(calls, 1);
  h.visibility('visible'); assert.equal(calls, 2);
  h.stop(); finish(); await new Promise(setImmediate);
  h.tick(); assert.equal(calls, 2); assert.ok(h.cleaned());
});

test('initially hidden tabs wait and failed refreshes do not stop later retries', async () => {
  let calls = 0;
  const h = setup(async () => { calls++; throw new Error('offline'); }, 'hidden');
  assert.equal(calls, 0);
  h.visibility('visible'); await new Promise(setImmediate);
  assert.equal(calls, 1);
  h.tick(); await new Promise(setImmediate);
  assert.equal(calls, 2);
  h.stop();
});
