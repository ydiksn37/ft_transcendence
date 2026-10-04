import vault from 'node-vault';
import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

const ALLOWED_SECRET_KEYS = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FT_CLIENT_ID',
  'FT_CLIENT_SECRET',
]);

const REQUIRED_SECRETS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

function isPlaceholder(value: string): boolean {
  return /CHANGE_ME|PLACEHOLDER|EXAMPLE|DUMMY|YOUR[_-]/i.test(value);
}

function validateRequiredSecrets(): void {
  for (const key of REQUIRED_SECRETS) {
    const value = process.env[key]?.trim();
    if (!value) throw new Error(`${key} is missing from Vault`);
    if (isPlaceholder(value)) {
      throw new Error(`${key} contains a placeholder value`);
    }
  }

  const jwtSecret = process.env.JWT_SECRET as string;
  const refreshSecret = process.env.JWT_REFRESH_SECRET as string;
  if (jwtSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error('JWT secrets must each be at least 32 characters');
  }
  if (jwtSecret === refreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  try {
    if (
      new URL(process.env.DATABASE_URL as string).protocol !== 'postgresql:'
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid postgresql URL');
  }
  try {
    if (new URL(process.env.REDIS_URL as string).protocol !== 'redis:') {
      throw new Error();
    }
  } catch {
    throw new Error('REDIS_URL must be a valid redis URL');
  }
}

function vaultIsRequired(): boolean {
  return process.env.VAULT_REQUIRED === 'true';
}

async function readVaultToken(): Promise<string | undefined> {
  if (process.env.VAULT_TOKEN) return process.env.VAULT_TOKEN;
  if (!process.env.VAULT_TOKEN_FILE) return undefined;
  const token = await readFile(process.env.VAULT_TOKEN_FILE, 'utf8');
  return token.trim() || undefined;
}

export async function initializeVault() {
  const logger = new Logger('Vault');

  if (!process.env.VAULT_ADDR) {
    if (vaultIsRequired()) {
      throw new Error('VAULT_ADDR is required when VAULT_REQUIRED=true');
    }
    logger.warn('VAULT_ADDR is not configured. Skipping Vault integration.');
    return false;
  }

  let token: string | undefined;
  try {
    token = await readVaultToken();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (vaultIsRequired())
      throw new Error(`Failed to read Vault token: ${message}`);
    logger.warn(`Failed to read Vault token: ${message}`);
    return false;
  }
  if (!token) {
    if (vaultIsRequired()) {
      throw new Error('VAULT_TOKEN or VAULT_TOKEN_FILE is required');
    }
    logger.warn('Vault token is not configured. Skipping Vault integration.');
    return false;
  }

  const client = vault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token,
  });

  try {
    const secretPath =
      process.env.VAULT_SECRET_PATH ?? 'secret/data/transcendence';
    const { data } = await client.read(secretPath);

    if (data && data.data) {
      for (const [key, value] of Object.entries(data.data)) {
        if (ALLOWED_SECRET_KEYS.has(key)) process.env[key] = String(value);
      }
      validateRequiredSecrets();
      logger.log('Successfully loaded secrets from Vault into process.env');
      return true;
    }
    throw new Error(`Vault secret ${secretPath} has no data`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (vaultIsRequired())
      throw new Error(`Failed to load secrets from Vault: ${message}`);
    logger.warn(`Failed to read from Vault: ${message}`);
    return false;
  }
}
