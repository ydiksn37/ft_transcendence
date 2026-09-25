import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportUserSettingsDto, UpdateGameSettingsDto } from './dto/user.dto';

describe('settings import preview', () => {
  const findUnique = jest.fn(),
    upsert = jest.fn();
  const service = new ExportService({
    userGameSettings: { findUnique, upsert },
  } as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({ volume: 100, showGhost: true });
  });
  it('returns owner-scoped proposed changes without writing', async () => {
    const result = await service.previewUserSettings('owner', {
      volume: 25,
      showGhost: false,
      touchFlick: true,
    });
    expect(result.changes).toEqual([
      { field: 'volume', previous: 100, next: 25 },
      { field: 'showGhost', previous: true, next: false },
    ]);
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'owner' } });
    expect(upsert).not.toHaveBeenCalled();
  });
  it('reports creation when preferences do not exist', async () => {
    findUnique.mockResolvedValue(null);
    expect(
      await service.previewUserSettings('owner', { volume: 25 }),
    ).toMatchObject({
      createsSettings: true,
      changes: [{ field: 'volume', previous: null, next: 25 }],
    });
  });
  it('rejects non-nullable nulls both in preview and import before writing', async () => {
    const data = { volume: null } as unknown as UpdateGameSettingsDto;
    await expect(
      service.previewUserSettings('owner', data),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.importUserSettings('owner', data),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('allows exported null key bindings to clear saved custom bindings', async () => {
    await service.importUserSettings('owner', {
      keyBindings: null,
    } as unknown as UpdateGameSettingsDto);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 'owner' },
      create: { userId: 'owner', keyBindings: Prisma.DbNull },
      update: { keyBindings: Prisma.DbNull },
    });
  });
  it('validates nested preferences and rejects ownership injection or arrays', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const settings of [
      { volume: 101 },
      { userId: 'victim' },
      [],
      { keyBindings: { unknown: 'KeyA' } },
    ]) {
      await expect(
        pipe.transform(
          { settings },
          { type: 'body', metatype: ImportUserSettingsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
