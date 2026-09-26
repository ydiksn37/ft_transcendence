#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const scanHistory = process.argv.includes('--history');
const findings = [];

const runGit = (args, options = {}) =>
  execFileSync('git', args, {
    cwd: new URL('..', import.meta.url),
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });

const isForbiddenPath = (path) => {
  if (path === '.env.example') return false;
  return (
    /(^|\/)\.env(?:\.|$)/.test(path) ||
    /(^|\/)secrets\//.test(path) ||
    /\.(?:key|pem|p12|pfx)$/i.test(path)
  );
};

const placeholder = (value) =>
  value === '' ||
  /CHANGE_ME|PLACEHOLDER|EXAMPLE|DUMMY|YOUR[_-]/i.test(value) ||
  /^\$\{[^}]+\}$/.test(value);

const secretAssignment =
  /^\s*(JWT_SECRET|JWT_REFRESH_SECRET|SESSION_SECRET|POSTGRES_PASSWORD|REDIS_PASSWORD|FT_CLIENT_SECRET|SMTP_PASS|TWILIO_AUTH_TOKEN)\s*[:=]\s*["']?([^"'#\s]+)["']?/;

const credentialPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/],
];

function scanContent(label, path, content) {
  if (isForbiddenPath(path)) findings.push(`${label}: forbidden tracked path: ${path}`);

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (/(^|\/)\.env(?:\.|$)/.test(path)) {
      const assignment = line.match(secretAssignment);
      if (assignment && !placeholder(assignment[2])) {
        findings.push(`${label}:${path}:${index + 1}: non-placeholder ${assignment[1]}`);
      }
    }
    for (const [kind, pattern] of credentialPatterns) {
      if (pattern.test(line)) findings.push(`${label}:${path}:${index + 1}: ${kind}`);
    }
  }
}

function scanWorkingTree() {
  const paths = runGit(['ls-files', '-z']).split('\0').filter(Boolean);
  for (const path of paths) {
    let content;
    try {
      content = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    } catch {
      continue;
    }
    scanContent('working-tree', path, content);
  }
}

function scanGitHistory() {
  const revisions = runGit(['rev-list', '--all']).trim().split('\n').filter(Boolean);
  const seenBlobs = new Set();

  for (const revision of revisions) {
    const entries = runGit(['ls-tree', '-r', '-z', revision]).split('\0').filter(Boolean);
    for (const entry of entries) {
      const match = entry.match(/^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/);
      if (!match) continue;
      const [, blob, path] = match;
      if (seenBlobs.has(blob)) continue;
      seenBlobs.add(blob);

      let content;
      try {
        content = runGit(['cat-file', 'blob', blob]);
      } catch {
        continue;
      }
      if (content.includes('\0')) continue;
      scanContent(`history:${revision.slice(0, 12)}`, path, content);
    }
  }
}

scanWorkingTree();
if (scanHistory) scanGitHistory();

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed (${scanHistory ? 'working tree and Git history' : 'working tree'}).`);
