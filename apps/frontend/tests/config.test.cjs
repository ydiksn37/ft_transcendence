const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(fetcher, stored = {}) {
  const slots = [], effects = [], timers = new Map(), exports = {};
  const storage = new Map(Object.entries({ token: 'test', ...stored }));
  let cursor = 0, dirty = true, value, nextTimer = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const result = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(result, slots[i])) { slots[i] = result; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((dep, index) => !Object.is(dep, old.deps[index]))) {
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/hooks/useConfig.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: () => react, AbortController, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { addEventListener() {}, removeEventListener() {} }, fetch: fetcher,
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
  });
  async function flush() {
    for (let i = 0; i < 12; i++) {
      if (dirty) { dirty = false; cursor = 0; value = exports.useConfig(); while (effects.length) effects.shift()(); }
      await Promise.resolve();
    }
  }
  return { flush, current: () => value, storage, runTimers: async () => { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); await flush(); } };
}

test('failed initial fetch never enables writes of fallback settings', async () => {
  const calls = [];
  const h = mount(async (url, options) => { calls.push([url, options]); return { ok: false }; });
  await h.flush();
  assert.ok(h.current().settingsError);
  h.current().setShowGhost(false);
  await h.flush(); await h.runTimers();
  assert.equal(calls.length, 1);
});

test('partial key bindings keep defaults and loaded visual preferences persist on change', async () => {
  const calls = [];
  const h = mount(async (url, options) => {
    calls.push([url, options]);
    return { ok: true, json: async () => ({ gameSettings: { keyBindings: { left: 'KeyJ' }, showGhost: false, minoSkin: 'MINIMAL', das: 170, arr: 33, dcd: 0, sdf: 6, volume: 100, sfxEnabled: true, musicEnabled: true } }) };
  });
  await h.flush();
  assert.equal(h.current().keyConfig.left, 'KeyJ');
  assert.equal(h.current().keyConfig.hardDrop, 'KeyW');
  assert.equal(h.current().showGhost, false);
  assert.equal(h.current().minoSkin, 'MINIMAL');
  await h.runTimers(); assert.equal(calls.length, 1);
  h.current().setMinoSkin('RETRO'); await h.flush(); await h.runTimers();
  const body = JSON.parse(calls[1][1].body);
  assert.equal(body.minoSkin, 'RETRO'); assert.equal(body.showGhost, false);
  assert.equal(body.keyBindings.hardDrop, 'KeyW');
});

test('failed guest migration preserves local preferences and blocks further saves', async () => {
  const h = mount(async () => ({ ok: false }), { tetrisShowGhost: 'false' });
  await h.flush();
  assert.equal(h.storage.get('tetrisShowGhost'), 'false');
  assert.ok(h.current().settingsError);
});
