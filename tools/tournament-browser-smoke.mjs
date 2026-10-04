import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import {
  attachBrowserDiagnostics,
  createTestJwt,
  findChrome,
  readDevelopmentVaultSecret,
} from './browser-test-utils.mjs';

const baseUrl = process.env.BROWSER_BASE_URL ?? 'https://localhost:8443';
const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(line => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map(line => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, '')];
    }),
);
const databaseUrl = new URL(await readDevelopmentVaultSecret('DATABASE_URL'));
databaseUrl.hostname = '127.0.0.1';
databaseUrl.port = env.POSTGRES_PORT || '54320';
const requireFromBackend = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const { PrismaClient } = requireFromBackend('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });

const suffix = Date.now().toString(36);
const roomName = `Chrome tournament ${suffix}`;
const users = Array.from({ length: 4 }, (_, index) => ({
  id: randomUUID(),
  email: `browser-tournament-${suffix}-${index + 1}@example.invalid`,
  username: `browser_tournament_${suffix}_${index + 1}`,
  displayName: `Tournament Player ${index + 1}`,
  role: 'USER',
}));

const tokens = await Promise.all(users.map(user => createTestJwt(user.id, user.role)));

const browser = await chromium.launch({
  executablePath: await findChrome(),
  headless: true,
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader'],
});
console.log(`Chrome ${browser.version()}`);
const contexts = [];
const diagnostics = [];

const hardDropUntilFinished = async pages => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const finished = await Promise.all(
      pages.map(page => page.getByRole('button', { name: /RETURN TO ROOM/ }).count()),
    );
    if (finished.every(Boolean)) return;
    await Promise.all(
      pages.map((page, index) => finished[index] ? undefined : page.keyboard.press('KeyW')),
    );
    await pages[0].waitForTimeout(120);
  }
  throw new Error('tournament matches did not finish after 50 hard drops');
};

const waitForBoards = async (pages, phase) => {
  const results = await Promise.allSettled(
    pages.map(page => page.locator('canvas').first().waitFor({ state: 'visible', timeout: 12_000 })),
  );
  if (results.every(result => result.status === 'fulfilled')) return;
  const states = await Promise.all(
    pages.map(async (page, index) => {
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240);
      return `player ${index + 1}: canvases=${await page.locator('canvas').count()} body=${text}`;
    }),
  );
  throw new Error(`${phase} boards did not appear\n${states.join('\n')}`);
};

const cleanup = async () => {
  const tournaments = await prisma.tournament.findMany({
    where: { name: roomName },
    select: { id: true, matches: { select: { gameResultId: true } } },
  });
  const tournamentIds = tournaments.map(tournament => tournament.id);
  const gameResultIds = tournaments.flatMap(tournament =>
    tournament.matches.flatMap(match => match.gameResultId ? [match.gameResultId] : []),
  );
  if (tournamentIds.length) {
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  }
  if (gameResultIds.length) {
    await prisma.gameResult.deleteMany({ where: { id: { in: gameResultIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
};

try {
  await prisma.user.createMany({ data: users });
  for (const [index, user] of users.entries()) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });
    contexts.push(context);
    await context.addInitScript(({ token, storedUser }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(storedUser));
    }, { token: tokens[index], storedUser: user });
    const page = await context.newPage();
    await attachBrowserDiagnostics(page, diagnostics, `tournament player ${index + 1}`);
    const response = await page.goto(new URL('/play/CUSTOM_ROOMS', baseUrl).toString(), {
      waitUntil: 'networkidle',
    });
    if (!response?.ok()) diagnostics.push(`player ${index + 1} HTTP ${response?.status() ?? 'no response'}`);
  }

  const pages = contexts.map(context => context.pages()[0]);
  const owner = pages[0];
  await owner.getByPlaceholder('ROOM NAME').fill(roomName);
  await owner.getByRole('button', { name: 'CREATE ROOM' }).click();
  for (const page of pages.slice(1)) {
    const room = page.locator('.panel > div').filter({ hasText: roomName });
    await room.getByRole('button', { name: 'JOIN' }).click();
    await page.getByText('WAITING FOR OWNER...').waitFor();
  }

  await owner.getByText('READY TO START!').waitFor();
  await owner.getByRole('button', { name: 'START' }).click();
  await Promise.all(pages.map(page => page.getByText('TOURNAMENT BRACKET').waitFor()));
  await owner.getByRole('button', { name: 'START NEXT MATCH' }).click();
  await waitForBoards(pages, 'semifinal');
  await owner.waitForTimeout(3500);

  const semifinalBoardCounts = await Promise.all(
    pages.map(page => page.getByTestId('opponent-board').count()),
  );
  if (semifinalBoardCounts.some(count => count !== 1)) {
    diagnostics.push(`semifinal board counts: ${semifinalBoardCounts.join(',')}`);
  }

  await hardDropUntilFinished(pages);
  await Promise.all(pages.map(page => page.getByRole('button', { name: /RETURN TO ROOM/ }).click()));
  await owner.getByRole('button', { name: 'START NEXT MATCH' }).waitFor({ timeout: 7000 });
  await owner.getByRole('button', { name: 'START NEXT MATCH' }).click();
  await waitForBoards(pages, 'final');
  await owner.waitForTimeout(3500);

  const finalBoardCounts = await Promise.all(
    pages.map(page => page.getByTestId('opponent-board').count()),
  );
  const sortedFinalCounts = [...finalBoardCounts].sort((left, right) => left - right);
  if (sortedFinalCounts.join(',') !== '1,1,2,2') {
    diagnostics.push(`final player/spectator board counts: ${finalBoardCounts.join(',')}`);
  }

  await hardDropUntilFinished(pages);
  const completedBoardCounts = await Promise.all(
    pages.map(page => page.getByTestId('opponent-board').count()),
  );
  if (completedBoardCounts.some(count => count > 2)) {
    diagnostics.push(`duplicate boards after tournament completion: ${completedBoardCounts.join(',')}`);
  }
  await Promise.all(pages.map(page => page.getByRole('button', { name: /RETURN TO ROOM/ }).click()));
  await owner.getByRole('button', { name: 'FINISH TOURNAMENT' }).waitFor({ timeout: 7000 });
  await owner.getByRole('button', { name: 'FINISH TOURNAMENT' }).click();
  await owner.getByText('READY TO START!').waitFor({ timeout: 7000 });
  const clearedBoardCounts = await Promise.all(
    pages.map(page => page.getByTestId('opponent-board').count()),
  );
  if (clearedBoardCounts.some(count => count !== 0)) {
    diagnostics.push(`boards remained after clearing tournament: ${clearedBoardCounts.join(',')}`);
  }

  if (diagnostics.length) {
    throw new Error(`Tournament browser smoke failed:\n- ${diagnostics.join('\n- ')}`);
  }
  console.log('PASS 4-player tournament switches spectator boards and clears them after completion');
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => undefined)));
  await browser.close().catch(() => undefined);
  await cleanup();
  await prisma.$disconnect();
}
