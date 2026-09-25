import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { SearchHistoryDto } from './dto/user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';

describe('history UTC date filters', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const service = new UsersService(
    { gameResult: { findMany, count } } as unknown as PrismaService,
    {} as RedisService,
    {} as MailService,
  );
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (query: object) =>
    pipe.transform(query, { type: 'query', metatype: SearchHistoryDto });

  it('includes the full last UTC day and combines owner and mode filters', async () => {
    await service.getGameHistory(
      'owner',
      await validate({
        from: '2026-09-01',
        to: '2026-09-30',
        mode: 'LINES_40',
      }),
    );
    const where = {
      OR: [{ player1Id: 'owner' }, { player2Id: 'owner' }],
      gameMode: 'LINES_40',
      createdAt: {
        gte: new Date('2026-09-01T00:00:00Z'),
        lt: new Date('2026-10-01T00:00:00Z'),
      },
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('rejects reversed dates, invalid dates and timestamps instead of date-only values', async () => {
    await expect(
      service.getGameHistory('owner', { from: '2026-09-30', to: '2026-09-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    for (const from of ['2026-02-30', '2026-09-01T12:00:00Z', 'invalid']) {
      await expect(validate({ from })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
