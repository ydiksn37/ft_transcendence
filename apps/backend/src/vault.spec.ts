import vault from 'node-vault';
import { initializeVault } from './vault';

jest.mock('node-vault', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedVault = vault as jest.MockedFunction<typeof vault>;

describe('initializeVault', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_REQUIRED;
    delete process.env.VAULT_TOKEN;
    delete process.env.VAULT_TOKEN_FILE;
    delete process.env.VAULT_SECRET_PATH;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails closed when Vault is required but not configured', async () => {
    process.env.VAULT_REQUIRED = 'true';
    await expect(initializeVault()).rejects.toThrow('VAULT_ADDR is required');
  });

  it('loads only allow-listed secret keys', async () => {
    process.env.VAULT_ADDR = 'http://vault:8200';
    process.env.VAULT_REQUIRED = 'true';
    process.env.VAULT_TOKEN = 'test-token';
    const read = jest.fn().mockResolvedValue({
      data: {
        data: {
          JWT_SECRET: 'from-vault',
          NODE_OPTIONS: '--inspect=0.0.0.0:9229',
        },
      },
    });
    mockedVault.mockReturnValue({ read } as never);

    await expect(initializeVault()).resolves.toBe(true);
    expect(read).toHaveBeenCalledWith('secret/data/transcendence');
    expect(process.env.JWT_SECRET).toBe('from-vault');
    expect(process.env.NODE_OPTIONS).not.toBe('--inspect=0.0.0.0:9229');
  });

  it('does not fall back to local secrets when required Vault fails', async () => {
    process.env.VAULT_ADDR = 'http://vault:8200';
    process.env.VAULT_REQUIRED = 'true';
    process.env.VAULT_TOKEN = 'test-token';
    mockedVault.mockReturnValue({
      read: jest.fn().mockRejectedValue(new Error('sealed')),
    } as never);

    await expect(initializeVault()).rejects.toThrow(
      'Failed to load secrets from Vault: sealed',
    );
  });
});
