const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
const source = fs.readFileSync(
  path.join(__dirname, '../src/lib/formValidation.ts'),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(code, { exports: exportsObject });

const {
  isSixDigitCode,
  parseBoundedInteger,
  validateEmail,
  validateLength,
} = exportsObject;

test('validates authentication fields at backend-compatible boundaries', () => {
  assert.equal(validateEmail('player@example.com'), null);
  assert.match(validateEmail('not-an-email'), /valid email/);
  assert.match(validateEmail(`${'a'.repeat(250)}@x.io`), /valid email/);
  assert.equal(validateLength('abc', 'Username', 3, 20), null);
  assert.match(validateLength('  ', 'Username', 3, 20), /3-20/);
  assert.match(validateLength('a'.repeat(21), 'Username', 3, 20), /3-20/);
});

test('accepts exactly six digits for 2FA', () => {
  assert.equal(isSixDigitCode('123456'), true);
  for (const value of ['12345', '1234567', '12a456', '<script>']) {
    assert.equal(isSixDigitCode(value), false);
  }
});

test('parses bounded integer inputs without coercing decimals or injection strings', () => {
  assert.equal(parseBoundedInteger('1', 1, 3650), 1);
  assert.equal(parseBoundedInteger('3650', 1, 3650), 3650);
  for (const value of ['0', '3651', '1.5', '-1', '1 OR 1=1', '']) {
    assert.equal(parseBoundedInteger(value, 1, 3650), null);
  }
});
