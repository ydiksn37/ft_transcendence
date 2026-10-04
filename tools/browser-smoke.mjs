import { chromium } from 'playwright-core';
import { attachBrowserDiagnostics, createTestJwt, findChrome } from './browser-test-utils.mjs';

const baseUrl = process.env.BROWSER_BASE_URL ?? 'https://localhost:8443';
const browser = await chromium.launch({
  executablePath: await findChrome(),
  headless: true,
  args: ['--ignore-certificate-errors', '--use-angle=swiftshader'],
});
console.log(`Chrome ${browser.version()}`);
const failures = [];

const scenarios = [
  { path: '/', viewport: { width: 1440, height: 900 }, text: 'Project T' },
  { path: '/', viewport: { width: 1024, height: 768 }, text: 'Project T' },
  { path: '/', viewport: { width: 390, height: 844 }, text: 'PLAY AS GUEST' },
  // Mobile intentionally hides CONFIG and MULTI PLAY.
  { path: '/menu', viewport: { width: 390, height: 844 }, text: 'MARATHON' },
  { path: '/login', viewport: { width: 1440, height: 900 }, text: 'SCHOOL 42' },
  { path: '/profile', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/profile/user-id', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/settings', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/friends', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/search', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/chat', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/admin', viewport: { width: 1440, height: 900 }, text: 'SIGN IN', redirectPath: '/login' },
  { path: '/privacy-policy', viewport: { width: 1440, height: 900 }, text: 'Privacy' },
  { path: '/terms-of-service', viewport: { width: 1440, height: 900 }, text: 'Terms' },
];

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const diagnostics = [];
    await attachBrowserDiagnostics(page, diagnostics, `${scenario.path} ${scenario.viewport.width}x${scenario.viewport.height}`);

    const url = new URL(scenario.path, baseUrl).toString();
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response?.ok()) diagnostics.push(`HTTP ${response?.status() ?? 'no response'}`);
    const bodyText = await page.locator('body').innerText();
    if (scenario.redirectPath && new URL(page.url()).pathname !== scenario.redirectPath) {
      diagnostics.push(`expected redirect to ${scenario.redirectPath}, received ${page.url()}`);
    }
    if (!bodyText.toLowerCase().includes(scenario.text.toLowerCase())) {
      diagnostics.push(`missing text: ${scenario.text}`);
    }
    if (/something went wrong|error occurred in `stage`/i.test(bodyText)) {
      diagnostics.push('application error boundary rendered');
    }
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    if (overflow.document > 1 || overflow.body > 1) {
      diagnostics.push(`horizontal overflow: document=${overflow.document}px body=${overflow.body}px`);
    }
    if (diagnostics.length) failures.push(`${scenario.path} ${scenario.viewport.width}x${scenario.viewport.height}\n  ${diagnostics.join('\n  ')}`);
    else console.log(`PASS ${scenario.path} ${scenario.viewport.width}x${scenario.viewport.height}`);
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const profileToken = await createTestJwt('8b1f83c8-44a5-4a34-9d49-3bbfb2d44ef8');
  await context.addInitScript(token => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      id: '8b1f83c8-44a5-4a34-9d49-3bbfb2d44ef8',
      username: 'browser-smoke',
      email: 'browser@example.com',
      displayName: 'Browser Smoke',
      avatarUrl: null,
      role: 'USER',
    }));
  }, profileToken);
  await context.route('**/api/users/**', async route => {
    const { pathname } = new URL(route.request().url());
    const responses = {
      '/api/users/me': {
        id: '8b1f83c8-44a5-4a34-9d49-3bbfb2d44ef8',
        username: 'browser-smoke', email: 'browser@example.com',
        displayName: 'Browser Smoke', avatarUrl: null, role: 'USER',
        gameSettings: {
          showGhost: true, minoSkin: 'NEON', displayTheme: 'CYBER',
          mapStyle: 'GRID', backgroundStyle: 'MATRIX', keyBindings: {},
          das: 133, arr: 33, dcd: 1, sdf: 6, touchFlick: true,
          volume: 50, sfxEnabled: true, musicEnabled: true,
        },
      },
      '/api/users/me/stats': {
        totalGames: 3, wins: 1, losses: 2, winRate: 33.3,
        currentWinStreak: 0, bestWinStreak: 1,
        totalLinesCleared: 42, totalTSpins: 1, totalTetrises: 2,
        bestApm: 12.5, avgApm: 10.5, bestPps: 1.25, avgPps: 1.1,
        totalPlayTime: 300, xp: 1170, level: 2, rank: 'SILVER', rankPoints: 250,
      },
      '/api/users/me/history': { data: [], total: 0, page: 1, limit: 20 },
      '/api/users/me/progression': {
        xp: 1170, level: 2, levelProgress: 170, levelTarget: 1000,
        rank: 'SILVER', rankPoints: 250,
        achievements: [
          { key: 'first_win', group: 'wins', groupName: 'Victories', tier: 1, totalTiers: 2, name: 'First victory', description: 'Win matches: 1.', target: 1, progress: 1, xpReward: 100, earnedAt: '2026-09-26T00:00:00.000Z' },
          { key: 'ten_wins', group: 'wins', groupName: 'Victories', tier: 2, totalTiers: 2, name: 'Ten victories', description: 'Win matches: 10.', target: 10, progress: 1, xpReward: 200, earnedAt: null },
        ],
      },
    };
    const body = responses[pathname];
    if (!body) return route.fulfill({ status: 404, body: '{}' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  const page = await context.newPage();
  const diagnostics = [];
  await attachBrowserDiagnostics(page, diagnostics, '/profile');
  const response = await page.goto(new URL('/profile', baseUrl).toString(), { waitUntil: 'networkidle' });
  if (!response?.ok()) diagnostics.push(`HTTP ${response?.status() ?? 'no response'}`);
  let bodyText = await page.locator('body').innerText();
  for (const expected of ['ACHIEVEMENTS', 'LEVEL', '250 RP', '1170 XP TOTAL', '170 / 1000 XP']) {
    if (!bodyText.includes(expected)) diagnostics.push(`missing text: ${expected}`);
  }
  await page.getByRole('tab', { name: 'ACHIEVEMENTS' }).click();
  await page.getByText('1 / 2 UNLOCKED', { exact: true }).waitFor();
  bodyText = await page.locator('body').innerText();
  if (!bodyText.includes('1 / 2 UNLOCKED')) {
    diagnostics.push(`missing text: 1 / 2 UNLOCKED (achievement view: ${bodyText.replace(/\s+/g, ' ').slice(-500)})`);
  }
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  if (overflow.document > 1 || overflow.body > 1) {
    diagnostics.push(`horizontal overflow: document=${overflow.document}px body=${overflow.body}px`);
  }
  if (diagnostics.length) failures.push(`/profile 1440x1000\n  ${diagnostics.join('\n  ')}`);
  else console.log('PASS /profile progression 1440x1000');
  await context.close();

  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const adminUser = {
    id: '936d9659-5726-4f29-b98d-48a44a274454',
    username: 'admin-smoke', email: 'admin@example.com',
    displayName: 'Admin Smoke', avatarUrl: null, role: 'ADMIN',
  };
  await adminContext.addInitScript(user => {
    localStorage.setItem('token', 'browser-smoke-admin-token');
    localStorage.setItem('user', JSON.stringify(user));
  }, adminUser);
  let managedUsers = [
    adminUser,
    {
      id: '3473a80c-0f4b-496c-973e-242ae80aee30',
      username: 'managed-user', email: 'managed@example.com',
      displayName: 'Managed User', bio: '', role: 'USER',
      avatarUrl: null, isOnline: false, bannedUntil: null,
    },
  ];
  await adminContext.route('**/api/admin/users**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (pathname === '/api/admin/users' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: managedUsers, total: managedUsers.length }) });
    }
    if (pathname === '/api/admin/users' && method === 'POST') {
      const input = request.postDataJSON();
      const created = {
        id: '1bb5bf07-40d1-43ff-a40c-b32ddd609ec9',
        ...input, password: undefined, bio: null, role: 'USER',
        avatarUrl: null, isOnline: false, bannedUntil: null,
      };
      managedUsers = [...managedUsers, created];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    const targetId = pathname.split('/').at(-1);
    if (method === 'PATCH') {
      const input = request.postDataJSON();
      managedUsers = managedUsers.map(user => user.id === targetId ? { ...user, ...input } : user);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(managedUsers.find(user => user.id === targetId)) });
    }
    if (method === 'DELETE') {
      managedUsers = managedUsers.filter(user => user.id !== targetId);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Deleted' }) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  const adminPage = await adminContext.newPage();
  const adminDiagnostics = [];
  await attachBrowserDiagnostics(adminPage, adminDiagnostics, '/admin');
  const adminResponse = await adminPage.goto(new URL('/admin', baseUrl).toString(), { waitUntil: 'networkidle' });
  if (!adminResponse?.ok()) adminDiagnostics.push(`HTTP ${adminResponse?.status() ?? 'no response'}`);
  await adminPage.getByLabel('Email').fill('created@example.com');
  await adminPage.getByLabel('Username').fill('created-user');
  await adminPage.getByLabel('Display name').first().fill('Created User');
  await adminPage.getByLabel('Password').fill('StrongPassword42!');
  await adminPage.getByRole('button', { name: 'CREATE USER' }).click();
  await adminPage.getByText('User created with USER role.').waitFor();
  await adminPage.getByText('created-user').waitFor();

  const managedCard = adminPage.locator('.dashboard-grid .arcade-panel').filter({ hasText: 'managed-user' });
  await managedCard.getByRole('button', { name: 'EDIT PROFILE' }).click();
  await adminPage.getByLabel('Display name').last().fill('Updated User');
  await adminPage.getByLabel('Bio').fill('Updated from browser smoke');
  await adminPage.getByRole('button', { name: 'SAVE PROFILE' }).click();
  await adminPage.getByText('Profile updated.').waitFor();

  adminPage.once('dialog', dialog => dialog.accept('managed-user'));
  await managedCard.getByRole('button', { name: 'PERMANENTLY DELETE' }).click();
  await adminPage.getByText('User and personal data permanently deleted. This cannot be undone.').waitFor();
  if (await adminPage.getByText('managed-user').count()) {
    adminDiagnostics.push('deleted user remained visible');
  }
  if (adminDiagnostics.length) failures.push(`/admin CRUD 1440x1000\n  ${adminDiagnostics.join('\n  ')}`);
  else console.log('PASS /admin create, edit and delete 1440x1000');
  await adminContext.close();

  const searchContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await searchContext.addInitScript(() => localStorage.setItem('token', 'browser-smoke-token'));
  let rankedRequest = '';
  await searchContext.route('**/api/users/search?**', async route => {
    rankedRequest = route.request().url();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 'rank-1', username: 'leader', displayName: 'Rank Leader', avatarUrl: null, isOnline: true, role: 'USER', stats: { rank: 'SILVER', rankPoints: 515, winRate: 62.5, totalGames: 40 } },
          { id: 'rank-2', username: 'runner-up', displayName: 'Runner Up', avatarUrl: null, isOnline: false, role: 'USER', stats: { rank: 'BRONZE', rankPoints: 250, winRate: 50, totalGames: 20 } },
        ],
        total: 2, page: 1, limit: 10, totalPages: 1,
      }),
    });
  });
  const searchPage = await searchContext.newPage();
  const searchDiagnostics = [];
  await attachBrowserDiagnostics(searchPage, searchDiagnostics, '/search');
  const searchResponse = await searchPage.goto(new URL('/search', baseUrl).toString(), { waitUntil: 'networkidle' });
  if (!searchResponse?.ok()) searchDiagnostics.push(`HTTP ${searchResponse?.status() ?? 'no response'}`);
  const searchText = await searchPage.locator('body').innerText();
  for (const expected of ['#1', 'Rank Leader', '515 RP', '#2', 'Runner Up', '250 RP']) {
    if (!searchText.includes(expected)) searchDiagnostics.push(`missing text: ${expected}`);
  }
  if (!rankedRequest.includes('sortBy=RANK_POINTS_DESC')) {
    searchDiagnostics.push('rank-points ordering was not requested');
  }
  if (searchDiagnostics.length) failures.push(`/search ranking 1440x900\n  ${searchDiagnostics.join('\n  ')}`);
  else console.log('PASS /search API ranking values 1440x900');
  await searchContext.close();

  const multiplayerContexts = await Promise.all(
    Array.from({ length: 3 }, () =>
      browser.newContext({
        viewport: { width: 1280, height: 900 },
        ignoreHTTPSErrors: true,
      }),
    ),
  );
  const multiplayerDiagnostics = [];
  const multiplayerPages = await Promise.all(
    multiplayerContexts.map(async (multiplayerContext, index) => {
      const multiplayerPage = await multiplayerContext.newPage();
      await attachBrowserDiagnostics(multiplayerPage, multiplayerDiagnostics, `custom room player ${index + 1}`);
      const multiplayerResponse = await multiplayerPage.goto(
        new URL('/play/CUSTOM_ROOMS', baseUrl).toString(),
        { waitUntil: 'networkidle' },
      );
      if (!multiplayerResponse?.ok()) {
        multiplayerDiagnostics.push(`player ${index + 1} HTTP ${multiplayerResponse?.status() ?? 'no response'}`);
      }
      return multiplayerPage;
    }),
  );
  const [ownerPage, secondPage, thirdPage] = multiplayerPages;
  await ownerPage.getByPlaceholder('ROOM NAME').fill('Chrome multi room');
  await ownerPage.getByRole('button', { name: 'CREATE ROOM' }).click();
  for (const playerPage of [secondPage, thirdPage]) {
    const roomRow = playerPage.locator('.panel > div').filter({ hasText: 'Chrome multi room' });
    await roomRow.getByRole('button', { name: 'JOIN' }).click();
    await playerPage.getByText('WAITING FOR OWNER...').waitFor();
  }
  await ownerPage.getByText('READY TO START!').waitFor();
  await ownerPage.getByRole('button', { name: 'START' }).click();
  await Promise.all(
    multiplayerPages.map(multiplayerPage =>
      multiplayerPage.getByText('BATTLE ROYALE', { exact: true }).waitFor({ timeout: 5000 }),
    ),
  );
  if (multiplayerDiagnostics.length) {
    failures.push(`/play/CUSTOM_ROOMS 3 browsers\n  ${multiplayerDiagnostics.join('\n  ')}`);
  } else console.log('PASS /play/CUSTOM_ROOMS 3 independent browser contexts');
  await Promise.all(multiplayerContexts.map(multiplayerContext => multiplayerContext.close()));

  const duelContexts = await Promise.all(
    Array.from({ length: 2 }, () =>
      browser.newContext({
        viewport: { width: 1280, height: 900 },
        ignoreHTTPSErrors: true,
      }),
    ),
  );
  const duelDiagnostics = [];
  // Own game:state frames as delivered by the server, recorded outside the
  // page so a frozen renderer cannot hide or delay what the server sent.
  const duelStateFrames = duelContexts.map(() => []);
  const duelPages = await Promise.all(
    duelContexts.map(async (duelContext, index) => {
      const duelPage = await duelContext.newPage();
      duelPage.on('websocket', socket => {
        socket.on('framereceived', ({ payload }) => {
          if (typeof payload !== 'string' || !payload.startsWith('42["game:state"')) return;
          const [, state] = JSON.parse(payload.slice(2));
          duelStateFrames[index].push({
            at: Date.now(),
            started: state.started,
            pieceId: state.pieceId,
            y: state.activeMino.y,
          });
        });
      });
      await attachBrowserDiagnostics(duelPage, duelDiagnostics, `duel player ${index + 1}`);
      const duelResponse = await duelPage.goto(
        new URL('/play/CUSTOM_ROOMS', baseUrl).toString(),
        { waitUntil: 'networkidle' },
      );
      if (!duelResponse?.ok()) {
        duelDiagnostics.push(`duel player ${index + 1} HTTP ${duelResponse?.status() ?? 'no response'}`);
      }
      return duelPage;
    }),
  );
  const [duelOwnerPage, duelSecondPage] = duelPages;
  const duelRoomName = `Chrome duel ${Date.now()}`;
  await duelOwnerPage.getByPlaceholder('ROOM NAME').fill(duelRoomName);
  await duelOwnerPage.getByRole('button', { name: 'CREATE ROOM' }).click();
  const duelRoomRow = duelSecondPage.locator('.panel > div').filter({ hasText: duelRoomName });
  await duelRoomRow.getByRole('button', { name: 'JOIN' }).click();
  await duelOwnerPage.getByText('READY TO START!').waitFor();
  await duelOwnerPage.getByRole('button', { name: 'START' }).click();
  await Promise.all(
    duelPages.map(duelPage =>
      duelPage.locator('canvas').first().waitFor({ state: 'visible', timeout: 7000 }),
    ),
  );

  // Server gravity must keep the frozen player's piece falling at the same
  // rate as the active player's. Nobody sends input during this window.
  await duelOwnerPage.waitForTimeout(2500);
  const latestState = (index, until = Infinity) =>
    duelStateFrames[index].filter(frame => frame.started && frame.at <= until).at(-1);
  const freezeMs = 4000;
  const progressionCdp = await duelContexts[1].newCDPSession(duelSecondPage);
  const progressionStart = Date.now();
  const beforeFreeze = [latestState(0), latestState(1)];
  await progressionCdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await new Promise(resolve => setTimeout(resolve, freezeMs));
  const framesWhileFrozen = duelStateFrames[1]
    .filter(frame => frame.at > progressionStart && frame.at <= Date.now()).length;
  await progressionCdp.send('Page.setWebLifecycleState', { state: 'active' });
  await duelOwnerPage.waitForTimeout(700);
  const progressionEnd = Date.now();
  const afterFreeze = [latestState(0, progressionEnd), latestState(1, progressionEnd)];
  await progressionCdp.detach();
  if (beforeFreeze.some(state => !state) || afterFreeze.some(state => !state)) {
    duelDiagnostics.push('no started game:state frames around background-tab window');
  } else {
    const [activeDelta, frozenDelta] = [0, 1].map(index => afterFreeze[index].y - beforeFreeze[index].y);
    const minimumRows = Math.floor(freezeMs / 1000) - 1;
    if (beforeFreeze[1].pieceId !== afterFreeze[1].pieceId) {
      duelDiagnostics.push('frozen player piece changed without input');
    }
    if (frozenDelta < minimumRows) {
      duelDiagnostics.push(`server gravity stalled while tab was frozen: ${frozenDelta} rows in ${freezeMs} ms`);
    }
    if (Math.abs(frozenDelta - activeDelta) > 1) {
      duelDiagnostics.push(`frozen tab progressed ${frozenDelta} rows but active tab ${activeDelta}`);
    }
    if (framesWhileFrozen < minimumRows) {
      duelDiagnostics.push(`server sent only ${framesWhileFrozen} game:state frames while frozen`);
    }
    console.log(`INFO background tab: frozen=${frozenDelta} active=${activeDelta} rows, frames while frozen=${framesWhileFrozen}`);
  }

  // Freeze a real Chrome target to reproduce a background tab. The progression
  // checks above verify that snapshots continue while frozen; after resume the
  // battle canvas must remain mounted and usable. Avoid screenshot comparison
  // here because reading pixels back from a WebGL canvas itself causes Chrome's
  // "GPU stall due to ReadPixels" warning.
  await duelSecondPage.waitForTimeout(1000);
  const board = duelSecondPage.locator('canvas').first();
  await board.waitFor({ state: 'visible' });
  const cdp = await duelContexts[1].newCDPSession(duelSecondPage);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await duelOwnerPage.keyboard.press('KeyW');
  await duelOwnerPage.waitForTimeout(500);
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await duelSecondPage.waitForTimeout(750);
  if (!await duelSecondPage.locator('canvas').first().isVisible()) {
    duelDiagnostics.push('battle view was not restored after background-tab resume');
  }

  // Reload disconnects the Socket.IO transport. sessionStorage carries the
  // one-time reconnect token and the server rebinds the player within 15 s.
  await duelSecondPage.reload({ waitUntil: 'networkidle' });
  await duelSecondPage.locator('canvas').first().waitFor({ state: 'visible', timeout: 7000 });
  const reloadedText = await duelSecondPage.locator('body').innerText();
  if (/CONNECTION LOST|GAME SERVER IS UNAVAILABLE/.test(reloadedText)) {
    duelDiagnostics.push('connection error remained after reload reconnect');
  }

  // Repeated hard drops produce a normal server-authoritative top-out. Both
  // players return to the same room and start a second match (rematch).
  for (let index = 0; index < 40; index += 1) {
    if (await duelSecondPage.getByText(/YOU LOSE|YOU WIN!/).count()) break;
    await duelSecondPage.keyboard.press('KeyW');
    await duelSecondPage.waitForTimeout(120);
  }
  await duelSecondPage.getByText('YOU LOSE', { exact: true }).waitFor({ timeout: 7000 });
  await duelOwnerPage.getByText('YOU WIN!', { exact: true }).waitFor({ timeout: 7000 });
  await Promise.all(
    duelPages.map(duelPage =>
      duelPage.getByRole('button', { name: /RETURN TO ROOM/ }).click(),
    ),
  );
  await duelOwnerPage.getByText('READY TO START!').waitFor({ timeout: 5000 });
  await duelOwnerPage.getByRole('button', { name: 'START' }).click();
  await Promise.all(
    duelPages.map(duelPage =>
      duelPage.locator('canvas').first().waitFor({ state: 'visible', timeout: 7000 }),
    ),
  );

  if (duelDiagnostics.length) {
    failures.push(`/play/CUSTOM_ROOMS duel lifecycle\n  ${duelDiagnostics.join('\n  ')}`);
  } else {
    console.log('PASS /play/CUSTOM_ROOMS 2-player background, reconnect and rematch');
  }
  await Promise.all(duelContexts.map(duelContext => duelContext.close()));
} finally {
  await browser.close();
}

if (failures.length) {
  throw new Error(`Browser smoke test failed:\n${failures.join('\n')}`);
}
