import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from './dto/public-api.dto';

describe('Public API pagination', () => {
  const rows = Array.from({ length: 205 }, (_, id) => ({ id: String(id) }));
  const table = () => ({
    findMany: jest.fn(async ({ skip, take }: { skip: number; take: number }) => rows.slice(skip, skip + take)),
    count: jest.fn(async () => rows.length),
  });
  const user = { ...table(), findFirst: jest.fn(async () => ({ id: 'owner' })) };
  const gameResult = table();
  const tournament = table();
  const service = new PublicApiService({ user, gameResult, tournament } as unknown as PrismaService);

  it.each(['leaderboard', 'history', 'tournaments'] as const)('%s has no overlapping or missing rows at limit=100', async route => {
    const fetchPage = (page: number) => route === 'leaderboard'
      ? service.getLeaderboard(page, 100)
      : route === 'history'
        ? service.getUserHistory('player', page, 100)
        : service.getTournaments(page, 100);
    const pages = await Promise.all([1, 2, 3].map(fetchPage));
    expect(pages.flatMap(page => page!.data.map(row => row.id))).toEqual(rows.map(row => row.id));
    for (const [index, page] of pages.entries()) {
      expect(page).toMatchObject({ page: index + 1, limit: 100, total: 205, totalPages: 3 });
    }
    const db = route === 'leaderboard' ? user : route === 'history' ? gameResult : tournament;
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100, take: 100,
      orderBy: [route === 'leaderboard' ? { stats: { rankPoints: 'desc' } } : { createdAt: 'desc' }, { id: 'asc' }],
    }));
  });

  it('validates and transforms the documented pagination range', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const validate = (value: object) => pipe.transform(value, { type: 'query', metatype: PaginationQueryDto });
    expect(await validate({})).toMatchObject({ page: 1, limit: 20 });
    expect(await validate({ page: '2', limit: '100' })).toMatchObject({ page: 2, limit: 100 });
    for (const query of [{ page: 0 }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }]) {
      await expect(validate(query)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
