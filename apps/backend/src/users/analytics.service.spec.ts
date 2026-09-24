import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Analytics UTC daily window', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['2026-09-24T00:00:00Z', 1, '2026-09-24T00:00:00Z', '2026-09-25T00:00:00Z'],
    ['2026-09-24T23:59:59Z', 1, '2026-09-24T00:00:00Z', '2026-09-25T00:00:00Z'],
    ['2026-01-01T12:00:00Z', 30, '2025-12-03T00:00:00Z', '2026-01-02T00:00:00Z'],
    ['2024-03-01T12:00:00Z', 2, '2024-02-29T00:00:00Z', '2024-03-02T00:00:00Z'],
  ])('scopes %s / %s days to complete UTC buckets', async (now, days, start, end) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    const rows = [{ date: new Date(start), avgApm: 42.25, avgPps: 1.75 }];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new AnalyticsService({ gameAnalytic: { findMany } } as unknown as PrismaService);
    expect(await service.getMyAnalytics('owner', days)).toBe(rows);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'owner', date: { gte: new Date(start), lt: new Date(end) } },
      orderBy: { date: 'asc' },
    });
  });
});
