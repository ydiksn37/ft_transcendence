import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const game = await prisma.gameResult.findUnique({ where: { id: '8dfbf558-da88-4103-9795-0ea588828a9a' }, include: { player1: true, player2: true } });
  console.log(`Game: ${game!.id}`);
  console.log(`p1: ${game!.player1?.username} (APM: ${game!.player1Apm})`);
  console.log(`p2: ${game!.player2?.username} (APM: ${game!.player2Apm})`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
