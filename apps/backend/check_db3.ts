import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const games = await prisma.gameResult.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  for (const g of games) {
    console.log(`GameResult: mode=${g.gameMode}, p1Apm=${g.player1Apm}, p2Apm=${g.player2Apm}, dur=${g.durationSeconds}, date=${g.createdAt}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
