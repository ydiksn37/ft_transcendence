import { SprintService } from './sprint.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Sprint leaderboard views', () => {
  const record = {
    id: 'record',
    userId: 'owner',
    timeMs: 45000,
    lines: 40,
    pieces: 103,
    createdAt: new Date('2026-09-24T12:34:56.789Z'),
    user: {
      id: 'owner',
      username: 'player',
      displayName: 'Player',
      avatarUrl: null,
    },
  };

  it.each([false, true])(
    'formats dates and scopes the personal view: %s',
    async (personal) => {
      const findMany = jest.fn().mockResolvedValue([record]);
      const service = new SprintService({
        sprintRecord: { findMany },
      } as unknown as PrismaService);
      const result = personal
        ? await service.getMyRecords('owner', 5)
        : await service.getGlobalLeaderboard(5);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: personal ? { userId: 'owner', lines: 40 } : { lines: 40 },
          orderBy: { timeMs: 'asc' },
          take: 5,
        }),
      );
      expect(result[0]).toMatchObject({
        rank: 1,
        record: {
          id: 'record',
          timeMs: 45000,
          pieces: 103,
          createdAt: '2026-09-24T12:34:56.789Z',
        },
      });
      expect(record.createdAt).toBeInstanceOf(Date);
    },
  );
});
