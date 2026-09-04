import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.userStats.findMany();
  const test3 = users.find(u => u.userId !== null); // I don't know the exact username field, maybe there is a User table?
  
  const user = await prisma.user.findUnique({ where: { username: 'test3' } });
  if (!user) return;
  const games = await prisma.gameResult.findMany({ 
    where: { OR: [{ player1Id: user.id }, { player2Id: user.id }] },
    orderBy: { createdAt: 'desc' }
  });
  for (const g of games) {
    console.log(`id=${g.id.slice(0,8)} date=${g.createdAt.toISOString()} mode=${g.gameMode} p1Apm=${g.player1Apm} p2Apm=${g.player2Apm}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
