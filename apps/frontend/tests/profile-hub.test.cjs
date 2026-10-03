const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/profileHub.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams });
  return exports;
}

test('profile tab parsing falls back to overview', () => {
  const { getProfileTab } = load();
  assert.equal(getProfileTab('?tab=performance'), 'performance');
  assert.equal(getProfileTab('?tab=unknown'), 'overview');
  assert.equal(getProfileTab(''), 'overview');
});

test('tab changes and legacy dashboard redirect preserve mode and other query state', () => {
  const { profileSearch, legacyDashboardDestination } = load();
  assert.equal(profileSearch('?mode=MULTI_PLAY', 'achievements'), '?mode=MULTI_PLAY&tab=achievements');
  assert.equal(legacyDashboardDestination('?mode=MARATHON'), '/profile?mode=MARATHON&tab=performance');
});
