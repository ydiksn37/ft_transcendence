import vault from 'node-vault';
import { Logger } from '@nestjs/common';

export async function initializeVault() {
  const logger = new Logger('Vault');
  
  if (!process.env.VAULT_ADDR || !process.env.VAULT_DEV_ROOT_TOKEN_ID) {
    logger.warn('Vault credentials not fully provided. Skipping Vault integration.');
    return;
  }

  const client = vault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_DEV_ROOT_TOKEN_ID,
  });

  try {
    // 開発環境用のマウント (devモードではデフォでsecretがv2として有効)
    const { data } = await client.read('secret/data/transcendence');
    
    if (data && data.data) {
      for (const [key, value] of Object.entries(data.data)) {
        process.env[key] = String(value);
      }
      logger.log('Successfully loaded secrets from Vault into process.env');
    }
  } catch (error: any) {
    // Vault側にパスが存在しない（初期状態）などの場合は警告のみ出して起動を継続
    logger.warn(`Failed to read from Vault: ${error.message}. Continuing with local .env variables.`);
  }
}
