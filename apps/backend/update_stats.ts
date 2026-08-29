import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  if (users.length > 0) {
    await prisma.userStats.update({
      where: { userId: users[0].id },
      data: { bestApm: 123.45 }
    });
    console.log("Updated bestApm for user:", users[0].id);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
