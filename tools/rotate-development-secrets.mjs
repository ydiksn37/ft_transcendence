#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const original = readFileSync(envPath, 'utf8');

const values = Object.fromEntries(
  original
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, '')];
    }),
);

const postgresUser = values.POSTGRES_USER;
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(postgresUser ?? '')) {
  throw new Error('POSTGRES_USER must be a simple PostgreSQL identifier');
}

const rotated = {
  JWT_SECRET: randomBytes(64).toString('base64'),
  JWT_REFRESH_SECRET: randomBytes(64).toString('base64'),
  SESSION_SECRET: randomBytes(48).toString('hex'),
  POSTGRES_PASSWORD: randomBytes(48).toString('hex'),
  REDIS_PASSWORD: randomBytes(48).toString('hex'),
};

const replaceValue = (content, key, value) => {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!pattern.test(content)) throw new Error(`Missing ${key} in .env`);
  return content.replace(pattern, `${key}=${value}`);
};

let updated = original;
for (const [key, value] of Object.entries(rotated)) updated = replaceValue(updated, key, value);
updated = updated.replace(
  /^DATABASE_URL=.*$/m,
  `DATABASE_URL="postgresql://${postgresUser}:${rotated.POSTGRES_PASSWORD}@postgres:5432/${values.POSTGRES_DB}?schema=public"`,
);
updated = updated.replace(
  /^REDIS_URL=.*$/m,
  `REDIS_URL="redis://:${rotated.REDIS_PASSWORD}@redis:6379/0"`,
);

const sqlPassword = rotated.POSTGRES_PASSWORD.replaceAll("'", "''");
execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', postgresUser, '-d', 'postgres'],
  {
    cwd: root,
    input: `ALTER ROLE "${postgresUser}" WITH PASSWORD '${sqlPassword}';\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  },
);

const temporaryPath = `${envPath}.rotation.tmp`;
try {
  writeFileSync(temporaryPath, updated, { mode: 0o600 });
  renameSync(temporaryPath, envPath);
  chmodSync(envPath, 0o600);
} catch (error) {
  const oldPassword = values.POSTGRES_PASSWORD.replaceAll("'", "''");
  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', postgresUser, '-d', 'postgres'],
    {
      cwd: root,
      input: `ALTER ROLE "${postgresUser}" WITH PASSWORD '${oldPassword}';\n`,
      stdio: ['pipe', 'ignore', 'inherit'],
    },
  );
  throw error;
}

execFileSync('./tools/vault-init.sh', [], {
  cwd: root,
  env: {
    ...process.env,
    VAULT_ENV: 'development',
    VAULT_PURGE_SECRET_HISTORY: 'true',
    VAULT_ROTATE_BACKEND_TOKEN: 'true',
  },
  stdio: 'inherit',
});

execFileSync(
  'docker',
  ['compose', 'up', '-d', '--force-recreate', 'postgres', 'redis', 'backend'],
  { cwd: root, stdio: 'inherit' },
);

console.log('Development JWT, session, PostgreSQL, Redis, Vault data versions, and backend Vault token rotated.');
console.log('Existing access/refresh tokens are now invalid. External provider credentials were not changed.');
