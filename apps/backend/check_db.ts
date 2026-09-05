import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const results = await prisma.gameResult.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  for (const r of results) {
    console.log(`Game: p1Apm=${r.player1Apm}, p2Apm=${r.player2Apm}, dur=${r.durationSeconds}, time=${r.createdAt}`);
  }
  const stats = await prisma.userStats.findMany({ take: 2 });
  for (const s of stats) {
    console.log(`Stats: user=${s.userId}, bestApm=${s.bestApm}, avgApm=${s.avgApm}, totalGames=${s.totalGames}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
