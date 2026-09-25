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
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SESSION_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
]);

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
