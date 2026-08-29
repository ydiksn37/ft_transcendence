import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const stats = await prisma.userStats.findFirst();
  console.log(stats);
  
  if (stats) {
    const safeNum = (val: any) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };
    
    console.log("safeNum(bestApm):", safeNum(stats.bestApm));
    console.log("bestApm type:", typeof stats.bestApm);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
