import { ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { SearchUsersDto } from './dto/user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';

describe('ranked user search', () => {
  it('validates rank sorting and returns actual ranked DB rows with stable pagination', async () => {
    const rows = [{ id: 'player', stats: { rank: 'SILVER', rankPoints: 515 } }];
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(25);
    const service = new UsersService(
      { user: { findMany, count } } as unknown as PrismaService,
      {} as RedisService,
      {} as MailService,
    );
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const dto = await pipe.transform(
      { page: '2', limit: '10', sortBy: 'RANK_POINTS_DESC' },
      { type: 'query', metatype: SearchUsersDto },
    );
    expect(await service.searchUsers(dto)).toEqual({
      data: rows,
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        skip: 10,
        take: 10,
        orderBy: [{ stats: { rankPoints: 'desc' } }, { id: 'asc' }],
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });
});
