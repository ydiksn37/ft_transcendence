#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const original = readFileSync(envPath, 'utf8');
const postgresPasswordPath = resolve(root, 'secrets/dev/postgres_password.txt');
const redisPasswordPath = resolve(root, 'secrets/dev/redis_password.txt');

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

const oldPostgresPassword = readFileSync(postgresPasswordPath, 'utf8').trim();
const oldRedisPassword = readFileSync(redisPasswordPath, 'utf8').trim();
const newPostgresPassword = randomBytes(48).toString('hex');
const newRedisPassword = randomBytes(48).toString('hex');

const sqlPassword = newPostgresPassword.replaceAll("'", "''");
execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', postgresUser, '-d', 'postgres'],
  {
    cwd: root,
    input: `ALTER ROLE "${postgresUser}" WITH PASSWORD '${sqlPassword}';\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  },
);

const writeSecret = (path, value) => {
  const temporaryPath = `${path}.rotation.tmp`;
  writeFileSync(temporaryPath, `${value}\n`, { mode: 0o600 });
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
};

try {
  writeSecret(postgresPasswordPath, newPostgresPassword);
  writeSecret(redisPasswordPath, newRedisPassword);
  chmodSync(envPath, 0o600);
} catch (error) {
  writeSecret(postgresPasswordPath, oldPostgresPassword);
  writeSecret(redisPasswordPath, oldRedisPassword);
  const oldPassword = oldPostgresPassword.replaceAll("'", "''");
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
    VAULT_ROTATE_APPLICATION_SECRETS: 'true',
  },
  stdio: 'inherit',
});

execFileSync(
  'docker',
  ['compose', 'up', '-d', '--force-recreate', 'postgres', 'redis', 'backend'],
  { cwd: root, stdio: 'inherit' },
);

console.log('Development JWT, PostgreSQL, Redis, Vault data versions, and backend Vault token rotated.');
console.log('Existing access/refresh tokens are now invalid. External provider credentials were not changed.');
