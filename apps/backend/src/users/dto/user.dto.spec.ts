import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AdminUsersQueryDto,
  BanUserDto,
  ImportUserSettingsDto,
  UpdateGameSettingsDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './user.dto';

describe('game settings DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const transform = <T>(value: unknown, metatype: new () => T) =>
    pipe.transform(value, { type: 'body', metatype });

  it('accepts the settings currently sent by the frontend', async () => {
    const result = await transform(
      {
        das: 133,
        arr: 33,
        dcd: 1,
        sdf: 6,
        touchFlick: true,
        keyBindings: {
          left: 'KeyA',
          right: 'KeyD',
          softDrop: 'KeyS',
          hardDrop: 'KeyW',
          rotateCW: 'Slash',
          rotateCCW: 'Comma',
          rotate180: 'Period',
          hold: 'ShiftLeft',
          restart: 'KeyQ',
          quitToMenu: 'Escape',
        },
        volume: 50,
        sfxEnabled: true,
        musicEnabled: true,
        displayTheme: 'ARCADE',
        mapStyle: 'ARENA',
        backgroundStyle: 'STARS',
      },
      UpdateGameSettingsDto,
    );

    expect(result).toBeInstanceOf(UpdateGameSettingsDto);
  });

  it.each([
    [{ volume: 101 }],
    [{ sdf: -1 }],
    [{ arr: 1.5 }],
    [{ minoSkin: 'UNKNOWN' }],
    [{ displayTheme: 'UNKNOWN' }],
    [{ mapStyle: 'UNKNOWN' }],
    [{ backgroundStyle: 'UNKNOWN' }],
    [{ showGhost: 'true' }],
    [{ unexpected: true }],
    [{ keyBindings: { hardDrop: '', injectedAction: 'KeyX' } }],
  ])('rejects invalid or unknown settings: %p', async (value) => {
    await expect(
      transform(value, UpdateGameSettingsDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates settings nested inside an import payload', async () => {
    await expect(
      transform(
        { settings: { volume: 50, keyBindings: { hardDrop: 'Space' } } },
        ImportUserSettingsDto,
      ),
    ).resolves.toBeInstanceOf(ImportUserSettingsDto);

    await expect(
      transform(
        { settings: { volume: 50, passwordHash: 'must-not-pass' } },
        ImportUserSettingsDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('profile DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  it('bounds persisted avatar references', async () => {
    await expect(
      pipe.transform(
        { avatarUrl: 'preset:2' },
        { type: 'body', metatype: UpdateUserDto },
      ),
    ).resolves.toBeInstanceOf(UpdateUserDto);
    await expect(
      pipe.transform(
        { avatarUrl: 'x'.repeat(2049) },
        { type: 'body', metatype: UpdateUserDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('admin DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const transform = <T>(value: unknown, metatype: new () => T) =>
    pipe.transform(value, { type: 'body', metatype });

  it('accepts valid roles and rejects arbitrary role values', async () => {
    await expect(
      transform({ role: 'MODERATOR' }, UpdateUserRoleDto),
    ).resolves.toBeInstanceOf(UpdateUserRoleDto);
    await expect(
      transform({ role: 'SUPER_ADMIN' }, UpdateUserRoleDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the duration-based BAN payload sent by the frontend', async () => {
    await expect(
      transform({ reason: 'Violation of terms', durationDays: 7 }, BanUserDto),
    ).resolves.toBeInstanceOf(BanUserDto);
  });

  it.each([
    [{}],
    [{ reason: '   ', durationDays: 7 }],
    [{ reason: 'reason', durationDays: 0 }],
    [{ reason: 'reason', durationDays: 3651 }],
    [{ reason: 'reason', durationDays: 1.5 }],
    [{ reason: 'reason', bannedUntil: 'not-a-date' }],
    [{ reason: 'reason', unexpected: true }],
  ])('rejects an invalid BAN payload: %p', async (value) => {
    await expect(transform(value, BanUserDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('transforms and bounds admin pagination query values', async () => {
    await expect(
      transform({ page: '2', limit: '100' }, AdminUsersQueryDto),
    ).resolves.toMatchObject({ page: 2, limit: 100 });
    await expect(
      transform({ page: '0', limit: '101' }, AdminUsersQueryDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
