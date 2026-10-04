import { createHmac } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';

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
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
  const secretLine = envText.split(/\r?\n/).find(line => line.startsWith('JWT_SECRET='));
  const secret = secretLine?.slice('JWT_SECRET='.length).replace(/^"|"$/g, '');
  if (!secret) throw new Error('JWT_SECRET is required in .env for authenticated browser smoke tests');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: subject, role, iat: now, exp: now + 900 });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const ignoredConsoleMessages = [
  /GL Driver Message.*GPU stall due to ReadPixels/,
];

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
    if (ignoredConsoleMessages.some(pattern => pattern.test(message.text()))) return;
    diagnostics.push(`${label} console.${message.type()}: ${message.text()}${formatLocation(message)}`);
  });
  page.on('pageerror', error => diagnostics.push(`${label} pageerror: ${error.message}`));
  page.on('request', request => {
    const protocol = new URL(request.url()).protocol;
    if (protocol === 'http:' || protocol === 'ws:') {
      diagnostics.push(`${label} mixed-content request: ${request.url()}`);
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
