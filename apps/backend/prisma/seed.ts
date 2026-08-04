import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Create 10 users
  const passwordHash = await bcrypt.hash('password123', 10);
  
  for (let i = 1; i <= 10; i++) {
    const username = `user${i}`;
    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        email: `user${i}@example.com`,
        displayName: `Test User ${i}`,
        passwordHash,
      },
    });
    console.log(`Created user with id: ${user.id}`);
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
