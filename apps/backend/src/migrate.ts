import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { initializeVault } from './vault';

const SCHEMA_PATH = 'prisma/schema.prisma';
const MIGRATIONS_PATH = 'prisma/migrations';
const logger = new Logger('Migrate');

// DATABASE_URLはVaultから読むため、prisma CLIへはこのプロセスの環境を引き継ぐ
function prisma(args: string[]) {
  const result = spawnSync('npx', ['--no-install', 'prisma', ...args], {
    stdio: 'inherit',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function isUnmanagedExistingDatabase(): Promise<boolean> {
  const client = new PrismaClient();
  try {
    const [row] = await client.$queryRaw<
      { managed: boolean; tables: bigint }[]
    >`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS managed,
             (SELECT count(*) FROM information_schema.tables
               WHERE table_schema = 'public') AS tables`;
    return !row.managed && row.tables > 0n;
  } finally {
    await client.$disconnect();
  }
}

// `prisma db push` で作られた既存DBを、schemaと完全一致する場合に限り
// 全migration適用済みとして記録する。差分がある場合はデータ保護のため停止する。
async function baselineExistingDatabase() {
  if (!(await isUnmanagedExistingDatabase())) return;

  logger.warn('Existing database is not managed by Prisma Migrate');
  const diff = prisma([
    'migrate',
    'diff',
    '--from-url',
    process.env.DATABASE_URL as string,
    '--to-schema-datamodel',
    SCHEMA_PATH,
    '--exit-code',
  ]);
  if (diff === 2) {
    throw new Error(
      'Existing database differs from prisma/schema.prisma; back up the data and ' +
        'reconcile it manually (or reset it with `make reset-db`) before migrating',
    );
  }
  if (diff !== 0) throw new Error(`prisma migrate diff exited with ${diff}`);

  const migrations = readdirSync(MIGRATIONS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of migrations) {
    const status = prisma([
      'migrate',
      'resolve',
      '--applied',
      name,
      '--schema',
      SCHEMA_PATH,
    ]);
    if (status !== 0) {
      throw new Error(`prisma migrate resolve ${name} exited with ${status}`);
    }
  }
  logger.log(`Baselined ${migrations.length} migrations`);
}

async function migrate() {
  await initializeVault();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (process.env.MIGRATE_BASELINE_EXISTING === 'true') {
    await baselineExistingDatabase();
  }
  const status = prisma(['migrate', 'deploy', '--schema', SCHEMA_PATH]);
  if (status !== 0) {
    throw new Error(`prisma migrate deploy exited with ${status}`);
  }
  logger.log('Database migrations are up to date');
}

migrate().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
