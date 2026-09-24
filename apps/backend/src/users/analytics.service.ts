import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getMyAnalytics(userId: string, days: number = 30) {
    // Daily aggregates are stored at UTC midnight. Include today and the
    // preceding days - 1 buckets, regardless of server timezone/time of day.
    const endDate = new Date();
    endDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const pastDate = new Date(endDate);
    pastDate.setUTCDate(pastDate.getUTCDate() - days);

    const analytics = await this.prisma.gameAnalytic.findMany({
      where: {
        userId,
        date: { gte: pastDate, lt: endDate },
      },
      orderBy: { date: 'asc' },
    });

    return analytics;
  }
}
