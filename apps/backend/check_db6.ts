import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const games = await prisma.gameResult.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  for (const g of games) {
    console.log(`id=${g.id.slice(0,8)} p1Apm=${g.player1Apm} p2Apm=${g.player2Apm} dur=${g.durationSeconds}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
