import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.gameResult.create({
      data: {
        roomId: "test",
        player1Apm: 1000000000,
        player2Apm: 0,
        player1Pps: 0,
        player2Pps: 0,
        player1LinesCleared: 0,
        player2LinesCleared: 0,
        player1TSpins: 0,
        player2TSpins: 0,
        player1Tetrises: 0,
        player2Tetrises: 0,
        garbageSent1to2: 0,
        garbageSent2to1: 0,
        durationSeconds: 0,
        gameMode: 'VERSUS',
        isAiGame: false,
      }
    });
    console.log("Success");
  } catch(e) {
    console.error("Error:", e.message);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
