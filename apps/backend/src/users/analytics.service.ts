import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getMyAnalytics(userId: string, days: number = 30) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - days);

    const analytics = await this.prisma.gameAnalytic.findMany({
      where: {
        userId,
        date: { gte: pastDate },
      },
      orderBy: { date: 'asc' },
    });

    return analytics;
  }
}
