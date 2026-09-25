import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PublicApiService } from './public-api.service';
import { PublicApiController } from './public-api.controller';
import { PublicGameSettingsDto } from './dto/public-api.dto';
import { PrismaService } from '../prisma/prisma.service';

describe('public owner settings CRUD', () => {
  const settings = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };
  const service = new PublicApiService({
    userGameSettings: settings,
  } as unknown as PrismaService);
  const controller = new PublicApiController(service);
  const owner = { apiKeyRecord: { userId: 'owner' } };
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validate = (value: object) =>
    pipe.transform(value, { type: 'body', metatype: PublicGameSettingsDto });
  const dbError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('test', {
      code,
      clientVersion: '6.12.0',
    });
  beforeEach(() => jest.resetAllMocks());

  it('scopes every read/write to the API key owner, never payload userId', async () => {
    settings.findUnique.mockResolvedValue({ userId: 'owner' });
    await controller.getSettings(owner);
    await controller.createSettings(owner, {
      userId: 'victim',
      showGhost: false,
    } as PublicGameSettingsDto);
    await controller.replaceSettings(owner, { volume: 20 });
    await controller.deleteSettings(owner);
    expect(settings.findUnique).toHaveBeenCalledWith({
      where: { userId: 'owner' },
    });
    expect(settings.create.mock.calls[0][0].data.userId).toBe('owner');
    expect(settings.create.mock.calls[0][0].data.showGhost).toBe(false);
    expect(settings.update.mock.calls[0][0].where).toEqual({ userId: 'owner' });
    expect(settings.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner' },
    });
  });

  it('PUT replaces omitted fields with actual schema defaults, including cleared bindings', async () => {
    await controller.replaceSettings(owner, {
      volume: 0,
      showGhost: false,
      sdf: 0,
    });
    expect(settings.update.mock.calls[0][0].data).toEqual({
      minoSkin: 'NEON',
      showGhost: false,
      arr: 33,
      das: 170,
      dcd: 0,
      sdf: 0,
      volume: 0,
      sfxEnabled: true,
      musicEnabled: true,
      keyBindings: Prisma.DbNull,
    });
  });

  it('returns explicit missing/conflict errors rather than Prisma exceptions', async () => {
    settings.findUnique.mockResolvedValue(null);
    await expect(controller.getSettings(owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    settings.create.mockRejectedValue(dbError('P2002'));
    await expect(controller.createSettings(owner, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    settings.update.mockRejectedValue(dbError('P2025'));
    await expect(controller.replaceSettings(owner, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('accepts valid persisted preferences and nested key bindings', async () => {
    const dto = await validate({
      minoSkin: 'NEON',
      showGhost: false,
      arr: 0,
      volume: 100,
      keyBindings: { left: 'KeyA' },
    });
    expect(dto.keyBindings.left).toBe('KeyA');
  });

  it.each([
    { userId: 'victim' },
    { role: 'ADMIN' },
    { score: 999 },
    { touchFlick: true },
    { arr: -1 },
    { volume: 101 },
    { showGhost: 'true' },
    { minoSkin: 'INVALID' },
    { keyBindings: { left: 'KeyA', unknown: 'KeyQ' } },
  ])(
    'rejects unknown, unauthorized or invalid preference payload %j',
    async (payload) => {
      await expect(validate(payload)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
