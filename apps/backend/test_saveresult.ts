import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.gameResult.create({
    data: {
      roomId: "test",
      player1Apm: 12.34,
      player2Apm: 56.78,
      player1Pps: 1.234,
      player2Pps: 2.345,
      player1LinesCleared: 10,
      player2LinesCleared: 5,
      player1TSpins: 1,
      player2TSpins: 0,
      player1Tetrises: 2,
      player2Tetrises: 0,
      garbageSent1to2: 12,
      garbageSent2to1: 5,
      durationSeconds: 60,
      gameMode: 'VERSUS',
      isAiGame: false,
    }
  });
  console.log(result);
}
main().catch(console.error).finally(() => prisma.$disconnect());
