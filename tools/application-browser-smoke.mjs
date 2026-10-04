import { chromium } from 'playwright-core';
import {
  assertNoHorizontalOverflow,
  attachBrowserDiagnostics,
  createTestJwt,
  findChrome,
  reportScenario,
} from './browser-test-utils.mjs';

const baseUrl = process.env.BROWSER_BASE_URL ?? 'https://localhost:8443';
const browser = await chromium.launch({
  executablePath: await findChrome(),
  headless: true,
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader'],
});
console.log(`Chrome ${browser.version()}`);
const failures = [];

const me = {
  id: 'browser-user', username: 'browser-smoke', email: 'browser@example.com',
  displayName: 'Browser Smoke', bio: 'Browser test profile', avatarUrl: null,
  isOnline: true, role: 'USER', twoFactorEnabled: false,
  gameSettings: {
    showGhost: true, minoSkin: 'NEON', displayTheme: 'CYBER', mapStyle: 'GRID',
    backgroundStyle: 'MATRIX', keyBindings: {}, das: 133, arr: 33, dcd: 1,
    sdf: 6, touchFlick: true, volume: 50, sfxEnabled: true, musicEnabled: true,
  },
};
const friend = {
  id: 'friend-1', username: 'console_friend', displayName: 'Console Friend',
  bio: 'A deterministic browser-test friend.', avatarUrl: null, isOnline: true,
  role: 'USER',
  stats: {
    totalGames: 20, wins: 12, losses: 8, winRate: 60, currentWinStreak: 2,
    bestWinStreak: 5, totalLinesCleared: 400, totalTSpins: 10, totalTetrises: 20,
    bestApm: 32.5, avgApm: 24, bestPps: 1.8, avgPps: 1.4,
    totalPlayTime: 3600, xp: 2000, level: 3, rank: 'SILVER', rankPoints: 515,
  },
};
const friendship = {
  id: 'friendship-1', requesterId: me.id, addresseeId: friend.id,
  status: 'ACCEPTED', requester: me, addressee: friend,
};
const history = {
  data: [{
    id: 'game-1', createdAt: '2026-10-01T12:00:00.000Z', gameMode: 'VERSUS',
    player1Id: friend.id, player2Id: me.id, winnerId: friend.id,
    player1Apm: 30, player2Apm: 20, player1Pps: 1.5, player2Pps: 1.2,
    player1LinesCleared: 40, player2LinesCleared: 31,
  }],
  total: 1, page: 1, limit: 50,
};
const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body),
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  ignoreHTTPSErrors: true,
});
const accessToken = await createTestJwt(me.id);
await context.addInitScript(({ user, token }) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}, { user: me, token: accessToken });

let apiKeys = [];
await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();

  if (path === '/api/users/me/history') return json(route, history);
  if (path === '/api/users/me/analytics') return json(route, [{ date: '2026-10-01', games: 1, wins: 1, avgApm: 30, avgPps: 1.5 }]);
  if (path === '/api/users/me/stats') return json(route, friend.stats);
  if (path === '/api/users/me/progression') return json(route, {
    xp: 2000, level: 3, levelProgress: 0, levelTarget: 1500,
    rank: 'SILVER', rankPoints: 515,
    achievements: [{
      key: 'first_win', group: 'wins', groupName: 'Victories', tier: 1,
      totalTiers: 2, name: 'First victory', description: 'Win one match.',
      target: 1, progress: 1, xpReward: 100, earnedAt: '2026-10-01T00:00:00.000Z',
    }],
  });
  if (path === '/api/users/me' && method === 'PATCH') {
    return json(route, { ...me, ...request.postDataJSON() });
  }
  if (path === '/api/users/me') return json(route, me);
  if (path === `/api/users/${friend.id}/history`) return json(route, history);
  if (path === `/api/users/${friend.id}`) return json(route, friend);
  if (path === '/api/users/friends') return json(route, [friendship]);
  if (path === '/api/users/search') return json(route, {
    data: [friend], total: 1, page: 1, limit: 10, totalPages: 1,
  });
  if (path === '/api/chat/rooms') return json(route, [{
    id: 'global-room', type: 'GLOBAL', memberships: [],
  }, {
    id: 'direct-room', type: 'DIRECT', memberships: [
      { userId: me.id, user: me }, { userId: friend.id, user: friend },
    ],
  }]);
  if (path === '/api/chat/rooms/global-room/messages') return json(route, [{
    id: 'message-1', roomId: 'global-room', content: 'Console audit message',
    createdAt: '2026-10-01T12:00:00.000Z', sender: friend,
  }]);
  if (path === '/api/chat/rooms/direct-room/messages') return json(route, []);
  if (path === '/api/keys' && method === 'POST') {
    apiKeys = [{ id: 'key-1', label: request.postDataJSON().label, keyPrefix: 'ft_test', isActive: true, createdAt: '2026-10-01T00:00:00.000Z' }];
    return json(route, { key: 'ft_test_secret' }, 201);
  }
  if (path === '/api/keys') return json(route, apiKeys);
  return json(route, { message: `Unhandled browser-smoke route: ${method} ${path}` }, 404);
});

const runScenario = async (label, path, exercise) => {
  const page = await context.newPage();
  const diagnostics = [];
  await attachBrowserDiagnostics(page, diagnostics, label);
  try {
    const response = await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'networkidle' });
    if (!response?.ok()) diagnostics.push(`${label} navigation HTTP ${response?.status() ?? 'no response'}`);
    await exercise(page, diagnostics);
    const bodyText = await page.locator('body').innerText();
    if (/something went wrong|error occurred in `stage`/i.test(bodyText)) {
      diagnostics.push(`${label} application error boundary rendered`);
    }
    const overflow = await assertNoHorizontalOverflow(page);
    if (overflow.document > 1 || overflow.body > 1) {
      diagnostics.push(`${label} horizontal overflow: document=${overflow.document}px body=${overflow.body}px`);
    }
  } catch (error) {
    diagnostics.push(`${label} scenario failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    reportScenario(failures, label, diagnostics);
    await page.close();
  }
};

try {
  await runScenario('/profile tabs and editor', '/profile?tab=overview', async page => {
    await page.getByText('Browser Smoke', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'PERFORMANCE' }).click();
    await page.getByLabel('Game mode').waitFor();
    await page.getByRole('tab', { name: 'ACHIEVEMENTS' }).click();
    await page.getByText('Victories', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'OVERVIEW' }).click();
    await page.getByRole('button', { name: 'EDIT PROFILE' }).click();
    await page.getByLabel('DISPLAY NAME').fill('Browser Smoke Updated');
    await page.getByRole('button', { name: 'SAVE', exact: true }).click();
    await page.getByText('Browser Smoke Updated', { exact: true }).waitFor();
  });

  await runScenario('/search to public profile and back', '/search', async page => {
    await page.getByText('Console Friend', { exact: true }).click();
    await page.getByRole('heading', { name: 'PLAYER PROFILE' }).waitFor();
    await page.getByRole('button', { name: 'BACK TO SEARCH' }).click();
    await page.getByRole('heading', { name: 'ADVANCED SEARCH' }).waitFor();
  });

  await runScenario('/friends profile link', '/friends', async page => {
    await page.getByRole('heading', { name: 'FRIENDS LIST' }).waitFor();
    await page.getByRole('button', { name: "View Console Friend's profile" }).click();
    await page.getByRole('button', { name: 'BACK TO FRIENDS' }).click();
    await page.getByRole('heading', { name: 'FRIENDS LIST' }).waitFor();
  });

  await runScenario('/chat active room reload and profile link', '/chat', async page => {
    const globalRoom = page.getByRole('button', { name: /GLOBAL CHAT/ });
    await globalRoom.waitFor();
    await page.getByText('Console audit message', { exact: true }).waitFor();
    await globalRoom.click();
    await globalRoom.click();
    await page.getByText('Console audit message', { exact: true }).waitFor();
    await page.getByRole('button', { name: "View Console Friend's profile" }).click();
    await page.getByRole('button', { name: 'BACK TO CHAT' }).click();
    await page.getByText('Console audit message', { exact: true }).waitFor();
  });

  await runScenario('/settings API key interaction', '/settings', async page => {
    await page.getByRole('heading', { name: 'SETTINGS' }).waitFor();
    await page.getByPlaceholder('KEY LABEL').fill('Browser smoke key');
    await page.getByRole('button', { name: 'CREATE', exact: true }).click();
    await page.getByText('ft_test_secret', { exact: true }).waitFor();
  });

  await runScenario('/config tabs and previews', '/lobby/CONFIG', async page => {
    await page.getByRole('heading', { name: 'CONFIGURATION', exact: true }).waitFor();
    for (const tab of ['CONTROLS', 'DISPLAY', 'SOUND']) {
      await page.getByRole('tab', { name: tab }).click();
    }
  });

  await runScenario('/VS AI setup dialog', '/lobby/MULTI_PLAY', async page => {
    await page.getByRole('heading', { name: 'VS AI' }).waitFor();
    await page.getByRole('button', { name: 'EXPERT' }).click();
    await page.getByText(/VS AI \(/).waitFor();
    await page.getByRole('button', { name: 'CANCEL' }).click();
  });
} finally {
  await context.close();
  await browser.close();
}

if (failures.length) {
  throw new Error(`Application browser smoke failed:\n${failures.join('\n')}`);
}
