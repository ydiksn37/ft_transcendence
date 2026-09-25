import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ApiKeyService } from './api-key.service';
import { PrismaService } from '../prisma/prisma.service';

describe('API key lifecycle', () => {
  const apiKey = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const service = new ApiKeyService({ apiKey } as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    apiKey.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'key-id', ...data }),
    );
  });
  it('stores only a password hash and returns the raw secret only on creation', async () => {
    const result = await service.createApiKey('owner', 'integration');
    const stored = apiKey.create.mock.calls[0][0].data;
    expect(result.key).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.userId).toBe('owner');
    expect(stored.keyPrefix).toBe(result.key.slice(0, 8));
    expect(await bcrypt.compare(result.key, stored.keyHash)).toBe(true);
    expect(stored).not.toHaveProperty('key');
    expect(result).not.toHaveProperty('keyHash');
    await service.listApiKeys('owner');
    expect(apiKey.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { userId: 'owner' } }),
    );
    expect(apiKey.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'keyHash',
    );
  });
  it('rejects expired or exactly-now expiration before generating a key', async () => {
    await expect(
      service.createApiKey('owner', 'label', 10, new Date(0)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createApiKey('owner', 'label', 10, new Date()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(apiKey.create).not.toHaveBeenCalled();
  });
  it('cannot revoke another owner key', async () => {
    apiKey.findFirst.mockResolvedValue(null);
    await expect(
      service.revokeApiKey('other', 'key-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: 'key-id', userId: 'other' },
    });
    expect(apiKey.update).not.toHaveBeenCalled();
  });
  it('revokes the owner key by disabling it', async () => {
    apiKey.findFirst.mockResolvedValue({ id: 'key-id', userId: 'owner' });
    await service.revokeApiKey('owner', 'key-id');
    expect(apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-id' },
      data: { isActive: false },
    });
  });
});
