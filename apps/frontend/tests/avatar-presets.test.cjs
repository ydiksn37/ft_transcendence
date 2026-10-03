const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/avatarPresets.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
}

test('unconfigured avatars are stable per user', () => {
  const { resolveAvatar } = load();
  const first = resolveAvatar('player-id', null);
  const second = resolveAvatar('player-id', undefined);
  assert.deepEqual(first, second);
  assert.equal(first.photo, undefined);
});

test('explicit presets are not treated as image URLs', () => {
  const { AVATAR_PRESETS, resolveAvatar } = load();
  const avatar = resolveAvatar('player-id', 'preset:2');
  assert.deepEqual(avatar.preset, AVATAR_PRESETS[2]);
  assert.equal(avatar.photo, undefined);
});

test('custom avatar URLs remain photos with a stable fallback frame', () => {
  const { resolveAvatar } = load();
  const avatar = resolveAvatar('player-id', '/uploads/avatar.webp');
  assert.equal(avatar.photo, '/uploads/avatar.webp');
  assert.ok(avatar.preset.color);
  assert.ok(avatar.preset.symbol);
});
