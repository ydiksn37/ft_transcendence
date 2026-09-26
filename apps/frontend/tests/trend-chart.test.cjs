const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../src/components/dashboard/TrendChart.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(code, { exports: exportsObject, require(name) {
  if (name === 'react/jsx-runtime') {
    const jsx = (type, props) => ({ type, props });
    return { jsx, jsxs: jsx };
  }
  if (name === 'recharts') return new Proxy({}, { get: (_, key) => key });
  throw Error(name);
} });

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat().flatMap(nodes)];
}

test('chart preserves history API APM/PPS, latest 30 chronological records, and source array', () => {
  const games = Array.from({ length: 35 }, (_, i) => ({
    id: String(i), apm: 60.125 - i, pps: 2.375 - i / 100, result: 'WIN',
  }));
  const before = JSON.stringify(games);
  const tree = nodes(exportsObject.TrendChart({ games }));
  const chart = tree.find(n => n.type === 'LineChart');
  assert.equal(chart.props.data.length, 30);
  chart.props.data.forEach((point, i) => {
    assert.equal(point.apm, games[29 - i].apm);
    assert.equal(point.pps, games[29 - i].pps);
  });
  assert.equal(JSON.stringify(games), before);
  const axes = tree.filter(n => n.type === 'YAxis').map(n => n.props.yAxisId);
  const lines = tree.filter(n => n.type === 'Line');
  assert.deepEqual(axes, ['apm', 'pps']);
  for (const line of lines) assert.equal(line.props.yAxisId, line.props.dataKey);
});

test('empty history shows an explicit no-data state', () => {
  const tree = nodes(exportsObject.TrendChart({ games: [] }));
  assert.equal(tree.some(n => n.type === 'LineChart'), false);
  assert.ok(tree.some(n => n.props?.children === 'NO DATA AVAILABLE FOR TRENDS'));
});

test('chart prefers UTC daily analytics returned by the analytics API', () => {
  const analytics = [{ date: '2026-09-25T00:00:00.000Z', gamesPlayed: 3, avgApm: '42.50', avgPps: '1.750' }];
  const tree = nodes(exportsObject.TrendChart({ games: [{ apm: 99, pps: 4 }], analytics }));
  const chart = tree.find(n => n.type === 'LineChart');
  assert.deepEqual(JSON.parse(JSON.stringify(chart.props.data)), [{ name: '09-25', apm: 42.5, pps: 1.75 }]);
});
