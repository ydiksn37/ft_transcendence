import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
let jwtSecretPromise;

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next platform-specific Chrome location.
    }
  }
  throw new Error('Chrome was not found; set CHROME_BIN');
}

export async function createTestJwt(subject, role = 'USER') {
  const secret = await (jwtSecretPromise ??= readDevelopmentVaultSecret('JWT_SECRET'));
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: subject, role, iat: now, exp: now + 900 });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export async function readDevelopmentVaultSecret(field) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(field)) throw new Error(`Invalid Vault field: ${field}`);
  const token = (await readFile(new URL('../secrets/dev/vault_token.txt', import.meta.url), 'utf8')).trim();
  if (!token) throw new Error('Run make vault-init before authenticated browser smoke tests');
  const { stdout } = await execFileAsync(
    'docker',
    [
      'compose', 'exec', '-T',
      '-e', 'VAULT_ADDR=http://127.0.0.1:8200',
      '-e', 'VAULT_TOKEN',
      'vault', 'vault', 'kv', 'get', `-field=${field}`, 'secret/transcendence',
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, VAULT_TOKEN: token },
      maxBuffer: 1024 * 1024,
    },
  );
  const value = stdout.trim();
  if (!value) throw new Error(`Vault field ${field} is empty`);
  return value;
}

const formatLocation = message => {
  const location = message.location();
  if (!location.url) return '';
  return ` (${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0})`;
};

/**
 * Capture browser problems using one policy across every browser smoke test.
 * The label is deliberately included in every entry so failures from several
 * open pages remain actionable.
 */
export function attachBrowserDiagnostics(page, diagnostics, label) {
  page.on('console', message => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    diagnostics.push(`${label} console.${message.type()}: ${message.text()}${formatLocation(message)}`);
  });
  page.on('pageerror', error => diagnostics.push(`${label} pageerror: ${error.message}`));
  page.on('request', request => {
    const url = new URL(request.url());
    const protocol = url.protocol;
    if (protocol === 'http:' || protocol === 'ws:') {
      diagnostics.push(`${label} mixed-content request: ${request.url()}`);
    }
    if (url.pathname.split('/').includes('undefined')) {
      diagnostics.push(`${label} invalid undefined request: ${request.url()}`);
    }
  });
  page.on('requestfailed', request => {
    // Navigation and WebSocket teardown are normal during page/context close.
    // Static assets and API calls are not: their failure commonly leaves a
    // blank or partially rendered page without a useful console exception.
    if (!['document', 'script', 'stylesheet', 'image', 'font', 'fetch', 'xhr'].includes(request.resourceType())) return;
    const failure = request.failure()?.errorText ?? 'unknown failure';
    if (failure === 'net::ERR_ABORTED') return;
    diagnostics.push(`${label} request failed: ${request.method()} ${request.url()} (${failure})`);
  });
  page.on('response', response => {
    if (response.status() < 500) return;
    diagnostics.push(`${label} HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
  });
}

export function assertNoHorizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

export function reportScenario(failures, label, diagnostics) {
  if (diagnostics.length) {
    failures.push(`${label}\n  ${diagnostics.join('\n  ')}`);
    return;
  }
  console.log(`PASS ${label}`);
}
