import { BadRequestException } from '@nestjs/common';
import { previewArchive } from './archive-import';
import { ExportService } from './export.service';

describe('personal game archive import', () => {
  const valid = {
    playedAt: '2026-09-20T12:00:00.000Z',
    mode: 'VERSUS',
    result: 'WIN',
    opponent: 'alice',
    score: 1200,
    apm: 42.5,
    pps: 1.8,
    lines: 20,
  };

  it('previews JSON rows and reports errors by row', () => {
    const result = previewArchive(
      'json',
      JSON.stringify([valid, { ...valid, pps: 101 }]),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { row: 2, errors: [expect.stringContaining('pps')] },
    ]);
  });

  it('parses quoted CSV fields', () => {
    const source = [
      'playedAt,mode,result,opponent,score,apm,pps,lines',
      '2026-09-20T12:00:00.000Z,VERSUS,LOSE,"name, with comma",900,20,1.2,12',
    ].join('\r\n');
    const result = previewArchive('csv', source);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      opponent: 'name, with comma',
      result: 'LOSE',
      score: 900,
    });
  });

  it('writes only to the isolated archive model', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      importedGameArchive: { createMany },
      gameResult: { createMany: jest.fn() },
      userStats: { update: jest.fn() },
      userAchievement: { createMany: jest.fn() },
    };
    const service = new ExportService(prisma as never);
    await expect(
      service.importGameArchive('owner', 'json', JSON.stringify([valid])),
    ).resolves.toEqual({ imported: 1 });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'owner', sourceFormat: 'json' }),
      ],
    });
    expect(prisma.gameResult.createMany).not.toHaveBeenCalled();
    expect(prisma.userStats.update).not.toHaveBeenCalled();
    expect(prisma.userAchievement.createMany).not.toHaveBeenCalled();
  });

  it('rejects the whole import when any row is invalid', async () => {
    const createMany = jest.fn();
    const service = new ExportService({
      importedGameArchive: { createMany },
    } as never);
    await expect(
      service.importGameArchive(
        'owner',
        'json',
        JSON.stringify([valid, { ...valid, result: 'CHEAT' }]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createMany).not.toHaveBeenCalled();
  });
});
