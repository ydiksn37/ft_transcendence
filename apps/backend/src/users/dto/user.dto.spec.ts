import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ImportUserSettingsDto, UpdateGameSettingsDto } from './user.dto';

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
