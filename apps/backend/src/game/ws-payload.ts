import type {
  AiDifficulty,
  AiPreviewStartRequest,
  GameInput,
} from '@transcendence/shared';

export class WsPayloadError extends Error {}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, allowed: readonly string[]): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WsPayloadError('payload must be an object');
  }
  const result = value as UnknownRecord;
  const unknown = Object.keys(result).find((key) => !allowed.includes(key));
  if (unknown) throw new WsPayloadError(`unknown field: ${unknown}`);
  return result;
}

function boundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string')
    throw new WsPayloadError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new WsPayloadError(
      `${field} must be ${minimum}-${maximum} characters`,
    );
  }
  if (pattern && !pattern.test(normalized)) {
    throw new WsPayloadError(`${field} has an invalid format`);
  }
  return normalized;
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new WsPayloadError(
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value as number;
}

export function parseRoomVisibility(value: unknown): { isPublic: boolean } {
  const data = record(value, ['isPublic']);
  if (typeof data.isPublic !== 'boolean')
    throw new WsPayloadError('isPublic must be a boolean');
  return { isPublic: data.isPublic };
}

export function parseCustomRoomName(value: unknown): {
  name?: string;
  isPublic: boolean;
} {
  const data = record(value, ['name', 'isPublic']);
  const visibility =
    data.isPublic === undefined
      ? { isPublic: true }
      : parseRoomVisibility({ isPublic: data.isPublic });
  if (data.name === undefined || data.name === null || data.name === '')
    return visibility;
  return { name: boundedString(data.name, 'name', 1, 40), ...visibility };
}

export function parseCustomRoomId(value: unknown, field = 'roomId'): string {
  const data = record(value, [field]);
  return boundedString(
    data[field],
    field,
    4,
    24,
    /^[A-Za-z0-9_-]+$/,
  ).toUpperCase();
}

export function parseOptionalRoomId(value: unknown): { roomId?: string } {
  const data = record(value ?? {}, ['roomId']);
  if (data.roomId === undefined) return {};
  return {
    roomId: boundedString(data.roomId, 'roomId', 1, 160, /^[A-Za-z0-9:_-]+$/),
  };
}

export function parseGameInput(value: unknown): GameInput {
  const data = record(value, ['roomId', 'pieceId']);
  return {
    roomId: boundedString(data.roomId, 'roomId', 1, 160, /^[A-Za-z0-9:_-]+$/),
    pieceId: boundedInteger(
      data.pieceId,
      'pieceId',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

export function parseAiMatch(value: unknown): {
  difficulty: AiDifficulty;
  actionDelayMs: number;
} {
  const data = record(value, ['difficulty', 'actionDelayMs']);
  if (!['EASY', 'HARD', 'EXPERT'].includes(String(data.difficulty))) {
    throw new WsPayloadError('difficulty must be EASY, HARD, or EXPERT');
  }
  return {
    difficulty: data.difficulty as AiDifficulty,
    actionDelayMs:
      data.actionDelayMs === undefined
        ? 50
        : boundedInteger(data.actionDelayMs, 'actionDelayMs', 0, 1000),
  };
}

export function parseAiPreview(value: unknown): AiPreviewStartRequest {
  const data = record(value, ['model', 'thinkTimeMs', 'actionDelayMs', 'seed']);
  const models = ['easy', 'hard', 'expert'];
  if (typeof data.model !== 'string' || !models.includes(data.model))
    throw new WsPayloadError('model is invalid');
  return {
    model: data.model as AiPreviewStartRequest['model'],
    thinkTimeMs:
      data.thinkTimeMs === undefined
        ? undefined
        : boundedInteger(data.thinkTimeMs, 'thinkTimeMs', 1, 5000),
    actionDelayMs:
      data.actionDelayMs === undefined
        ? undefined
        : boundedInteger(data.actionDelayMs, 'actionDelayMs', 0, 1000),
    seed:
      data.seed === undefined
        ? undefined
        : boundedInteger(data.seed, 'seed', 0, 0xffffffff),
  };
}

const VISUAL_MINOS = new Set([0, 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'X']);
const CELL_STATES = new Set(['clear', 'merged', 'ghost']);
export type VisualBoard = [string | 0, 'clear' | 'merged' | 'ghost'][][];

export function parseBoardUpdate(value: unknown): {
  stage: VisualBoard;
  score: number;
} {
  const data = record(value, ['stage', 'score', 'next', 'hold']);
  if (!Array.isArray(data.stage) || data.stage.length !== 40) {
    throw new WsPayloadError('stage must contain exactly 40 rows');
  }
  const valid = data.stage.every(
    (row) =>
      Array.isArray(row) &&
      row.length === 10 &&
      row.every(
        (cell) =>
          Array.isArray(cell) &&
          cell.length === 2 &&
          VISUAL_MINOS.has(cell[0]) &&
          CELL_STATES.has(cell[1]),
      ),
  );
  if (!valid) throw new WsPayloadError('stage contains an invalid cell');
  return {
    stage: data.stage as VisualBoard,
    score: boundedInteger(data.score, 'score', 0, 2_147_483_647),
  };
}

export function parseGarbage(value: unknown): {
  lines: number;
  generated?: number;
} {
  const data = record(value, ['lines', 'generated']);
  return {
    lines: boundedInteger(data.lines, 'lines', 0, 40),
    generated:
      data.generated === undefined
        ? undefined
        : boundedInteger(data.generated, 'generated', 0, 40),
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseChatJoin(value: unknown): { roomId: string } {
  const data = record(value, ['roomId']);
  return { roomId: boundedString(data.roomId, 'roomId', 36, 36, UUID) };
}

export function parseChatMessage(value: unknown): {
  roomId: string;
  content: string;
} {
  const data = record(value, ['roomId', 'content']);
  return {
    roomId: boundedString(data.roomId, 'roomId', 36, 36, UUID),
    content: boundedString(data.content, 'content', 1, 500),
  };
}
