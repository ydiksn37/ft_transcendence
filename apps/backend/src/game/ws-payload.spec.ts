import {
  parseAiMatch,
  parseBoardUpdate,
  parseChatMessage,
  parseCustomRoomId,
  parseCustomRoomName,
  parseRoomVisibility,
  parseGameInput,
  parseGarbage,
} from './ws-payload';

describe('WebSocket payload validation', () => {
  it('defaults rooms to public and accepts only boolean visibility', () => {
    expect(parseCustomRoomName({ name: 'room' })).toEqual({
      name: 'room',
      isPublic: true,
    });
    expect(parseCustomRoomName({ isPublic: false })).toEqual({
      isPublic: false,
    });
    for (const isPublic of ['false', null, 0, {}]) {
      expect(() => parseCustomRoomName({ isPublic })).toThrow();
      expect(() => parseRoomVisibility({ isPublic })).toThrow();
    }
    expect(() =>
      parseRoomVisibility({ isPublic: true, roomId: 'other' }),
    ).toThrow();
  });
  it('accepts bounded game input and rejects unknown fields', () => {
    expect(parseGameInput({ roomId: 'room_1', pieceId: 4 })).toEqual({
      roomId: 'room_1',
      pieceId: 4,
    });
    expect(() =>
      parseGameInput({ roomId: 'room_1', pieceId: 4, admin: true }),
    ).toThrow('unknown field');
    expect(() => parseGameInput({ roomId: 'room_1', pieceId: -1 })).toThrow(
      'pieceId',
    );
  });

  it('normalizes custom room IDs and enforces their size and alphabet', () => {
    expect(parseCustomRoomId({ roomId: 'ab_12' })).toBe('AB_12');
    expect(() => parseCustomRoomId({ roomId: '../room' })).toThrow(
      'invalid format',
    );
  });

  it('enforces AI enum and timing bounds', () => {
    expect(parseAiMatch({ difficulty: 'HARD', actionDelayMs: 50 })).toEqual({
      difficulty: 'HARD',
      actionDelayMs: 50,
    });
    expect(() =>
      parseAiMatch({ difficulty: 'IMPOSSIBLE', actionDelayMs: 50 }),
    ).toThrow('difficulty');
  });

  it('accepts only a 40 by 10 visual board with valid cells', () => {
    const stage = Array.from({ length: 40 }, () =>
      Array.from({ length: 10 }, () => [0, 'clear']),
    );
    expect(parseBoardUpdate({ stage, score: 100 }).stage).toHaveLength(40);
    expect(() =>
      parseBoardUpdate({ stage: stage.slice(1), score: 100 }),
    ).toThrow('40 rows');
    stage[0][0] = ['INVALID', 'merged'];
    expect(() => parseBoardUpdate({ stage, score: 100 })).toThrow(
      'invalid cell',
    );
  });

  it('bounds garbage and validates chat UUID/content length', () => {
    expect(parseGarbage({ lines: 4, generated: 5 })).toEqual({
      lines: 4,
      generated: 5,
    });
    expect(() => parseGarbage({ lines: 41 })).toThrow('lines');
    expect(
      parseChatMessage({
        roomId: '123e4567-e89b-42d3-a456-426614174000',
        content: ' hello ',
      }).content,
    ).toBe('hello');
    expect(() =>
      parseChatMessage({ roomId: 'not-a-uuid', content: 'hello' }),
    ).toThrow('roomId');
  });
});
