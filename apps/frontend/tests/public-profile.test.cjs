const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, globals) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, ...globals });
  return exports;
}

const user = { id: 'other', username: 'player', displayName: 'Player', isOnline: true,
  avatarUrl: 'preset:2', bio: 'Hello', stats: null };
function api(status = 200) {
  const calls = [];
  const service = compile('lib/publicProfile.ts', { fetch: async (url, options) => {
    calls.push({ url, options });
    if (options.signal.aborted) throw new Error('aborted');
    const responses = {
      '/api/users/other': user,
      '/api/users/me': { id: 'me' },
      '/api/users/friends': [{ id: 'f', requesterId: 'other', addresseeId: 'me', status: 'PENDING' }],
      '/api/users/other/history?limit=20': { data: [
        { id: 'g', player1Id: 'me', winnerId: 'other', createdAt: '2026-09-18T00:00:00Z',
          gameMode: 'ONLINE_1V1', player1Apm: '10', player2Apm: '60.5',
          player1Pps: '1', player2Pps: '2.5', player1LinesCleared: 10, player2LinesCleared: 42 },
      ] },
    };
    return { ok: status === 200, status, json: async () => responses[url] };
  } });
  return { service, calls };
}

test('public profile loads the target and maps battle results from their perspective', async () => {
  const { service, calls } = api();
  const controller = new AbortController();
  const data = await service.loadPublicProfile('other', 'test-token', controller.signal);
  assert.equal(data.user, user);
  assert.equal(data.friendship.id, 'f');
  assert.equal(data.games[0].result, 'WIN');
  assert.equal(data.games[0].apm, 60.5);
  assert.equal(data.games[0].pps, 2.5);
  assert.equal(data.games[0].lines, 42);
  for (const call of calls) {
    assert.equal(call.options.signal, controller.signal);
    assert.equal(call.options.headers.Authorization, 'Bearer test-token');
  }
});

test('deleted/missing, invalid and unauthorized profiles fail without loading private endpoints', async () => {
  for (const status of [404, 400, 401, 500]) {
    const { service, calls } = api(status);
    await assert.rejects(service.loadPublicProfile('other', 'token', new AbortController().signal),
      error => error.status === status);
    assert.equal(calls.length, 1);
  }
});

test('profile requests propagate cancellation', async () => {
  const { service } = api();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.loadPublicProfile('other', 'token', controller.signal), /aborted/);
});

function render(friendship, self = false, error = '', navigationState = {
  returnTo: '/search', returnLabel: 'SEARCH', returnState: { returnTo: '/profile?tab=overview' },
}) {
  let stateIndex = 0;
  const actions = [];
  const navigations = [];
  const data = { user, games: [], me: { id: self ? 'other' : 'me' }, friendship };
  const page = compile('pages/PublicProfile.tsx', {
    AbortController,
    localStorage: { getItem: () => 'token' },
    require(name) {
      if (name === 'react') return {
        useEffect() {}, useRef: () => ({ current: new AbortController() }),
        useState(initial) { return [stateIndex++ === 0 ? data : stateIndex === 2 ? error : initial, () => {}]; },
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-router-dom') return {
        useParams: () => ({ id: 'other' }),
        useLocation: () => ({ state: navigationState }),
        useNavigate: () => (...args) => navigations.push(args), Link: 'a',
      };
      if (name.includes('avatarPresets')) return { getAvatarPreset: () => ({ color: 'cyan', symbol: 'T' }) };
      if (name.includes('AvatarIcon')) return { AvatarIcon: 'avatar' };
      if (name.includes('RecentBattles')) return { RecentBattles: 'history' };
      if (name.includes('publicProfile')) return {
        profileRequest: async (...args) => actions.push(args),
      };
      if (name.endsWith('.css')) return {};
      throw Error(name);
    },
  });
  const wrapper = page.default();
  const tree = wrapper.type(wrapper.props);
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { nodes, actions, navigations };
}

test('profile friend controls use user IDs for removal and friendship IDs for responses', async () => {
  for (const [friend, label, path, method, body] of [
    [null, 'ADD FRIEND', 'friends/request', 'POST', { addresseeId: 'other' }],
    [{ id: 'f', status: 'ACCEPTED' }, 'REMOVE FRIEND', 'friends/other', 'DELETE', undefined],
    [{ id: 'f', status: 'PENDING', addresseeId: 'me' }, 'ACCEPT', 'friends/f', 'PATCH', { accept: true }],
    [{ id: 'f', status: 'PENDING', addresseeId: 'me' }, 'DECLINE', 'friends/f', 'PATCH', { accept: false }],
    [{ id: 'f', status: 'PENDING', addresseeId: 'other' }, 'CANCEL REQUEST', 'friends/other', 'DELETE', undefined],
  ]) {
    const h = render(friend);
    const button = h.nodes.find(node => node.type === 'button' && node.props.children === label);
    assert.ok(button, label);
    await button.props.onClick();
    assert.equal(h.actions[0][0], path);
    assert.equal(h.actions[0][3].method, method);
    assert.equal(h.actions[0][3].body, body ? JSON.stringify(body) : undefined);
  }
});

test('public profile returns directly to friends or the selected chat room', () => {
  for (const [returnTo, returnLabel] of [
    ['/friends?mode=MULTI_PLAY', 'FRIENDS'],
    ['/chat?room=global&mode=MULTI_PLAY', 'CHAT'],
  ]) {
    const view = render(null, false, '', { returnTo, returnLabel });
    const back = view.nodes.find(node => node.type === 'button' && node.props.className === 'back-btn');
    assert.equal(back.props.children.join(''), `◀ BACK TO ${returnLabel}`);
    back.props.onClick();
    assert.equal(view.navigations[0][0], returnTo);
    assert.equal(view.navigations[0][1].replace, true);
  }
});

test('own profile has no self-friend action; missing user shows an error instead of a spinner', () => {
  const own = render(null, true);
  assert.ok(own.nodes.some(node => node.props?.to === '/profile?tab=overview'));
  assert.ok(!own.nodes.some(node => node.props?.children === 'ADD FRIEND'));
  const missing = render(null, false, 'User not found.');
  assert.ok(missing.nodes.some(node => node.props?.role === 'alert'));
  assert.ok(!missing.nodes.some(node => node.props?.role === 'status'));
});

test('back to search replaces the public profile and preserves the search origin', () => {
  const view = render(null);
  const back = view.nodes.find(node => node.type === 'button' && node.props.className === 'back-btn');
  back.props.onClick();
  assert.equal(view.navigations[0][0], '/search');
  assert.equal(view.navigations[0][1].replace, true);
  assert.equal(view.navigations[0][1].state.returnTo, '/profile?tab=overview');
});
