const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function render(data, error = false) {
  const exports = {};
  let index = 0;
  const state = [data, error, 0];
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/dashboard/Progression.tsx'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return { useEffect() {}, useState: () => [state[index++], () => {}] };
    if (name === 'react/jsx-runtime') {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx };
    }
    if (name.endsWith('.css')) return {};
    throw Error(name);
  } });
  return exports.Progression();
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}

test('compact progression preserves XP and every achievement behind a closed disclosure', () => {
  const tree = nodes(render({
    level: 3, xp: 240, levelProgress: 40, levelTarget: 100, rank: 'BRONZE', rankPoints: 80,
    achievements: [
      { key: 'first', name: 'First win', description: 'Win once', progress: 1, target: 1, xpReward: 50, earnedAt: '2026-09-27T00:00:00Z' },
      { key: 'ten', name: 'Ten wins', description: 'Win ten times', progress: 1, target: 10, xpReward: 100, earnedAt: null },
    ],
  }));
  const disclosure = tree.find(node => node.type === 'details');
  assert.equal(disclosure.props.open, undefined);
  assert.equal(tree.filter(node => node.type === 'article').length, 2);
  const xp = tree.find(node => node.props['aria-label'] === 'XP toward next level');
  assert.equal(xp.props.value, 40);
  assert.equal(xp.props.max, 100);
  const count = tree.find(node => node.props.className === 'achievement-count');
  assert.equal(count.props.children.join(''), '1 / 2 UNLOCKED');
  assert.equal(tree.filter(node => node.type === 'progress').length, 3);
  let stopped = false;
  disclosure.props.onKeyDown({ key: 'Enter', stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
});

test('loading and retry states remain accessible', () => {
  assert.ok(nodes(render(null)).some(node => node.props.role === 'status'));
  const failed = nodes(render(null, true));
  assert.ok(failed.some(node => node.props.role === 'alert'));
  assert.ok(failed.some(node => node.type === 'button' && node.props.children === 'RETRY'));
});

test('tiers share one compact row showing the next unearned milestone', () => {
  const tree = nodes(render({
    xp: 0, level: 1, levelProgress: 0, levelTarget: 1000, rank: 'BRONZE', rankPoints: 0,
    achievements: [1, 10, 20, 50, 100, 200, 1000].map((target, index) => ({
      key: `win_${target}`, group: 'wins', groupName: 'Victories', name: `Wins ${index + 1}`,
      description: `Win ${target}`, target, progress: Math.min(target, 12), xpReward: 100,
      earnedAt: target <= 10 ? '2026-09-28T00:00:00Z' : null,
    })),
  }));
  assert.equal(tree.filter(node => node.type === 'article').length, 1);
  assert.equal(tree.filter(node => node.type === 'li').length, 7);
  const progress = tree.find(node => node.props['aria-label'] === 'Victories: next milestone');
  assert.equal(progress.props.value, 12);
  assert.equal(progress.props.max, 20);
});
