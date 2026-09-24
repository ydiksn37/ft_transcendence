const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/historyExport.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const game = { id: 'one', date: '2026-09-24', mode: 'LINES_40', result: null, apm: 42.123, pps: 1.234, lines: 40 };

test('CSV and PDF rows preserve the selected games, precision and unknown outcomes', () => {
  const rows = exportsObject.historyRows([game]);
  assert.equal(JSON.stringify(rows), JSON.stringify([['2026-09-24', 'LINES_40', 'UNSPECIFIED', 42.123, 1.234, 40]]));
  const csv = exportsObject.historyCsv([game]);
  assert.ok(csv.startsWith('\uFEFF"Date (UTC)"'));
  assert.ok(csv.endsWith('"42.123","1.234","40"\r\n'));
  assert.ok(!csv.includes('DRAW'));
});

test('quotes delimiters, newlines and quotes and neutralizes text formulas', () => {
  const csv = exportsObject.historyCsv([{ ...game, mode: '=1+1', date: 'a,"b"\nc' }]);
  assert.ok(csv.includes('"a,""b""\nc"'));
  assert.ok(csv.includes('"\'=1+1"'));
});

test('empty history exports only the header', () => {
  assert.equal(exportsObject.historyRows([]).length, 0);
  assert.equal(exportsObject.historyCsv([]).split('\r\n').length, 2);
});
