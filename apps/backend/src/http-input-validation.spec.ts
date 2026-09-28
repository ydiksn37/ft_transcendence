import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { TwoFactorCodeDto } from './auth/dto/auth-action.dto';
import { LoginDto } from './auth/dto/login.dto';
import { RegisterDto } from './auth/dto/register.dto';
import { CreateDirectRoomDto } from './chat/dto/chat.dto';
import { SaveSinglePlayerResultDto } from './game/dto/save-single-player-result.dto';
import {
  CreateApiKeyDto,
  LeaderboardQueryDto,
  UserHistoryQueryDto,
} from './public-api/dto/public-api.dto';
import { SaveSprintDto } from './sprint/dto/save-sprint.dto';
import {
  CreateTournamentDto,
  TournamentListQueryDto,
} from './tournament/dto/tournament.dto';
import { AnalyticsQueryDto } from './users/dto/analytics.dto';
import {
  FriendRequestDto,
  RespondFriendRequestDto,
  SearchHistoryDto,
  SearchUsersDto,
} from './users/dto/user.dto';

describe('HTTP input DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const transform = (value: unknown, metatype: new () => object) =>
    pipe.transform(value, { type: 'body', metatype });

  it.each([{ I: -1 }, { J: 1.5 }, { L: '2' }, { S: 1000001 }, { O: 1 }, []])(
    'rejects invalid other-spin counters %p',
    async (otherSpins) => {
      await expect(
        transform(
          {
            gameMode: 'MARATHON',
            linesCleared: 2,
            durationSeconds: 60,
            otherSpins,
          },
          SaveSinglePlayerResultDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('accepts all five non-T spin counters', async () => {
    await expect(
      transform(
        {
          gameMode: 'MARATHON',
          linesCleared: 20,
          durationSeconds: 60,
          otherSpins: { I: 1, J: 2, L: 3, S: 4, Z: 5 },
        },
        SaveSinglePlayerResultDto,
      ),
    ).resolves.toBeInstanceOf(SaveSinglePlayerResultDto);
  });

  it.each([
    [SearchUsersDto, { page: '2', limit: '50', status: 'ONLINE' }],
    [SearchHistoryDto, { mode: 'VERSUS', result: 'WIN' }],
    [FriendRequestDto, { username: '@player' }],
    [RespondFriendRequestDto, { accept: true }],
    [TwoFactorCodeDto, { code: '123456' }],
    [LoginDto, { email: 'player@example.com', password: 'password' }],
    [
      RegisterDto,
      {
        email: 'player@example.com',
        username: 'player',
        displayName: 'Player',
        password: 'password',
      },
    ],
    [
      CreateDirectRoomDto,
      { targetUserId: '123e4567-e89b-12d3-a456-426614174000' },
    ],
    [CreateTournamentDto, { name: 'Cup', maxPlayers: 8 }],
    [TournamentListQueryDto, { page: '1', limit: '20' }],
    [LeaderboardQueryDto, { page: '1', rank: 'GOLD' }],
    [UserHistoryQueryDto, { mode: 'MARATHON' }],
    [CreateApiKeyDto, { label: 'integration', rateLimit: 1000 }],
    [
      SaveSinglePlayerResultDto,
      {
        gameMode: '40_LINES',
        linesCleared: 40,
        durationSeconds: 60,
      },
    ],
    [SaveSprintDto, { timeMs: 60000, lines: 40, pieces: 100 }],
    [AnalyticsQueryDto, { days: '30' }],
  ] as const)('accepts valid %p input', async (metatype, value) => {
    await expect(transform(value, metatype)).resolves.toBeInstanceOf(metatype);
  });

  it.each([
    [SearchUsersDto, { page: 0 }],
    [SearchHistoryDto, { mode: 'CLASSIC' }],
    [FriendRequestDto, { addresseeId: 'not-a-uuid' }],
    [RespondFriendRequestDto, { accept: 'yes' }],
    [TwoFactorCodeDto, { code: '12345x' }],
    [LoginDto, { email: `${'a'.repeat(250)}@x.io`, password: 'password' }],
    [LoginDto, { email: 'player@example.com', password: '' }],
    [
      RegisterDto,
      {
        email: 'player@example.com',
        username: 'ab',
        displayName: 'Player',
        password: 'password',
      },
    ],
    [CreateDirectRoomDto, { targetUserId: 'not-a-uuid' }],
    [CreateTournamentDto, { name: 'Cup', maxPlayers: 5 }],
    [TournamentListQueryDto, { limit: 101 }],
    [LeaderboardQueryDto, { rank: 'LEGEND' }],
    [UserHistoryQueryDto, { mode: 'CLASSIC' }],
    [CreateApiKeyDto, { label: ' ', rateLimit: 0 }],
    [
      SaveSinglePlayerResultDto,
      { gameMode: 'VERSUS', linesCleared: -1, durationSeconds: 1 },
    ],
    [SaveSprintDto, { timeMs: 0 }],
    [AnalyticsQueryDto, { days: 0 }],
    [CreateApiKeyDto, { label: 'key', injected: true }],
  ] as const)('rejects invalid %p input', async (metatype, value) => {
    await expect(transform(value, metatype)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
