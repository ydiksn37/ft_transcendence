import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ include: { stats: true } });
  for (const u of users) {
    if (u.stats) {
      console.log(`User: ${u.username}, Best APM: ${u.stats.bestApm}, Total Games: ${u.stats.totalGames}`);
    }
  }
  
  const games = await prisma.gameResult.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  for (const g of games) {
    console.log(`GameResult: id=${g.id}, mode=${g.gameMode}, p1Apm=${g.player1Apm}, p2Apm=${g.player2Apm}, dur=${g.durationSeconds}, date=${g.createdAt}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
