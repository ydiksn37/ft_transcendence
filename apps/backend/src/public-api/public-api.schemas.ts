import {
  AiDifficulty,
  GameMode,
  MinoSkin,
  Rank,
  TournamentStatus,
} from '@prisma/client';
import type { ApiResponseSchemaHost } from '@nestjs/swagger';

type SchemaObject = ApiResponseSchemaHost['schema'];

export const errorResponse = (
  status: number,
  error: string,
  message: string,
): SchemaObject => ({
  type: 'object',
  required: ['statusCode', 'message', 'error'],
  properties: {
    statusCode: { type: 'integer', example: status },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    error: { type: 'string', example: error },
  },
  example: { statusCode: status, message, error },
});
export const badRequestResponse: SchemaObject = errorResponse(
  400,
  'Bad Request',
  'property userId should not exist',
);
export const unauthorizedResponse: SchemaObject = errorResponse(
  401,
  'Unauthorized',
  '無効なAPIキーです',
);
export const notFoundResponse: SchemaObject = errorResponse(
  404,
  'Not Found',
  'ユーザーが見つかりません',
);
export const conflictResponse: SchemaObject = errorResponse(
  409,
  'Conflict',
  '設定は既に存在します。PUTで置き換えてください',
);
export const quotaResponse: SchemaObject = {
  type: 'object',
  required: ['statusCode', 'message', 'retryAfter'],
  properties: {
    statusCode: { type: 'integer', example: 429 },
    message: { type: 'string' },
    retryAfter: {
      type: 'integer',
      minimum: 1,
      description: 'Seconds remaining in this key’s hourly window.',
    },
  },
  example: {
    statusCode: 429,
    message: 'レート制限超過。上限: 1000リクエスト/時間',
    retryAfter: 120,
  },
};

const text: SchemaObject = { type: 'string', example: 'player' };
const integer: SchemaObject = { type: 'integer', example: 0 };
const boolean: SchemaObject = { type: 'boolean', example: true };
const uuid: SchemaObject = {
  type: 'string',
  format: 'uuid',
  example: '00000000-0000-4000-8000-000000000001',
};
const date: SchemaObject = {
  type: 'string',
  format: 'date-time',
  example: '2026-09-23T00:00:00.000Z',
};
// Prisma Decimal.toJSON() returns a string, not a JSON number.
const decimal: SchemaObject = {
  type: 'string',
  example: '42.5',
  description: 'Decimal encoded as a string.',
};
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const enumeration = (values: Record<string, string>): SchemaObject => ({
  type: 'string',
  enum: Object.values(values),
  example: Object.values(values)[0],
});
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const integers = (...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, integer]));
const identity = { username: text, displayName: text };
const avatar: SchemaObject = { type: 'string', nullable: true, example: null };
const commonStats = {
  rank: enumeration(Rank),
  ...integers('rankPoints', 'wins', 'losses', 'totalGames'),
  winRate: decimal,
};
const profileStats = { ...commonStats, ...integers('level', 'xp') };
const performance = { bestApm: decimal, avgApm: decimal, bestPps: decimal };
const paginated = (item: SchemaObject): SchemaObject =>
  object({
    data: { type: 'array', items: item },
    total: integer,
    page: { type: 'integer', minimum: 1, example: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, example: 20 },
    totalPages: integer,
  });

export const leaderboardResponse: SchemaObject = paginated(
  object({
    id: uuid,
    ...identity,
    avatarUrl: avatar,
    isOnline: boolean,
    stats: nullable(object({ ...commonStats, ...performance })),
  }),
);
export const profileResponse: SchemaObject = object({
  id: uuid,
  ...identity,
  avatarUrl: avatar,
  bio: nullable(text),
  isOnline: boolean,
  lastSeenAt: nullable(date),
  createdAt: date,
  stats: nullable(object(profileStats)),
});
export const statsResponse: SchemaObject = object({
  id: uuid,
  userId: uuid,
  ...profileStats,
  ...performance,
  avgPps: decimal,
  ...integers(
    'totalLinesCleared',
    'totalTSpins',
    'totalTetrises',
    'currentWinStreak',
    'bestWinStreak',
  ),
  createdAt: date,
  updatedAt: date,
});
const participant = nullable(object({ ...identity, avatarUrl: avatar }));
export const historyResponse: SchemaObject = paginated(
  object({
    id: uuid,
    createdAt: date,
    gameMode: enumeration(GameMode),
    durationSeconds: integer,
    isAiGame: boolean,
    aiDifficulty: nullable(enumeration(AiDifficulty)),
    player1Apm: decimal,
    player2Apm: nullable(decimal),
    player1Pps: decimal,
    player2Pps: nullable(decimal),
    player1LinesCleared: integer,
    player2LinesCleared: nullable(integer),
    player1: participant,
    player2: participant,
    winner: nullable(object({ username: text })),
  }),
);
export const tournamentsResponse: SchemaObject = paginated(
  object({
    id: uuid,
    name: text,
    description: nullable(text),
    status: enumeration(TournamentStatus),
    maxPlayers: { type: 'integer', example: 8 },
    minPlayers: { type: 'integer', example: 4 },
    registrationDeadline: nullable(date),
    startedAt: nullable(date),
    endedAt: nullable(date),
    createdAt: date,
    creator: nullable(object(identity)),
    winner: nullable(object(identity)),
    _count: object({ entries: integer }),
  }),
);
export const settingsResponse: SchemaObject = object({
  id: uuid,
  userId: uuid,
  minoSkin: enumeration(MinoSkin),
  showGhost: boolean,
  arr: { type: 'integer', example: 33 },
  das: { type: 'integer', example: 170 },
  dcd: integer,
  sdf: {
    type: 'integer',
    example: 6,
    description: '0 means infinite soft drop.',
  },
  keyBindings: {
    type: 'object',
    nullable: true,
    additionalProperties: true,
    example: { left: 'ArrowLeft' },
  },
  volume: { type: 'integer', example: 100 },
  sfxEnabled: boolean,
  musicEnabled: boolean,
  createdAt: date,
  updatedAt: date,
});

const keyMetadata = {
  id: uuid,
  label: { type: 'string', example: 'My integration' } as SchemaObject,
  rateLimit: { type: 'integer', example: 1000 } as SchemaObject,
  expiresAt: nullable(date),
  createdAt: date,
};
export const createdKeyResponse: SchemaObject = object({
  ...keyMetadata,
  key: {
    type: 'string',
    pattern: '^[0-9a-f]{64}$',
    example: 'a'.repeat(64),
    description: 'Returned only once. Store securely; never publish or log.',
  },
  prefix: { type: 'string', example: 'aaaaaaaa' },
  warning: {
    type: 'string',
    example: 'このキーは今後表示されません。安全な場所に保管してください。',
  },
});
export const keysResponse: SchemaObject = {
  type: 'array',
  items: object({
    ...keyMetadata,
    keyPrefix: { type: 'string', example: 'aaaaaaaa' },
    isActive: boolean,
    lastUsedAt: nullable(date),
  }),
};
export const revokedKeyResponse: SchemaObject = object({
  message: { type: 'string', example: 'APIキーを無効化しました' },
});
