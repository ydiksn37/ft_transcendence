import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const stats = await prisma.userStats.findFirst({ where: { userId: '2edeaaf2-bece-485b-ab65-2f6dd22a5cca' } });
  console.log("Stats from DB:", stats);
}
main().catch(console.error).finally(() => prisma.$disconnect());
