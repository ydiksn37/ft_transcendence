import { createRequire } from 'node:module';
import { io } from 'socket.io-client';

// Resolve otplib/qrcode exactly as the backend does so the QR comparison is
// byte-for-byte meaningful.
const backendRequire = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const { authenticator } = backendRequire('otplib');
const { toDataURL } = backendRequire('qrcode');

const baseUrl = process.env.AUTH_BASE_URL ?? 'https://localhost:8443';
const oauthEmail = process.env.AUTH_SMOKE_OAUTH_EMAIL;
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

const failures = [];
const check = (condition, message) => {
  if (condition) console.log(`PASS ${message}`);
  else failures.push(message);
};

let rateLimitedRetries = 0;

async function api(method, path, { token, body } = {}) {
  let response;
  // nginx allows 5 auth requests/min (burst 10); wait out 429s instead of
  // weakening the limit for this test.
  // A function body is rebuilt per attempt so TOTP codes stay current.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = typeof body === 'function' ? body() : body;
    response = await fetch(new URL(`/api${path}`, baseUrl), {
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (response.status !== 429) break;
    rateLimitedRetries += 1;
    await new Promise(resolve => setTimeout(resolve, 13_000));
  }
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON bodies (e.g. WAF pages) are reported via status only.
  }
  return { status: response.status, json, text };
}

const leaksSecret = (response, secret) =>
  /passwordHash|twoFactorSecret/.test(response.text) || (secret && response.text.includes(secret));

// The server broadcasts user_status_changed only for sockets whose JWT it
// accepted, so an observer socket shows whether a token authenticated.
async function socketAuthenticates(token, userId) {
  const observer = io(baseUrl, {
    transports: ['websocket'], rejectUnauthorized: false, forceNew: true,
    auth: { guestGameSession: true },
  });
  await new Promise((resolve, reject) => {
    observer.once('session:ready', resolve);
    observer.once('connect_error', reject);
  });
  let authenticated = false;
  observer.on('user_status_changed', event => {
    if (event.userId === userId && event.isOnline) authenticated = true;
  });
  const candidate = io(baseUrl, {
    transports: ['websocket'], rejectUnauthorized: false, forceNew: true,
    auth: { token },
  });
  await new Promise(resolve => setTimeout(resolve, 1500));
  candidate.disconnect();
  observer.disconnect();
  return authenticated;
}

const suffix = Date.now().toString(36);
const password = `AuthSmoke-${suffix}-Pw1!`;
const account = {
  email: `auth-smoke-${suffix}@example.com`,
  username: `authsmoke_${suffix}`.slice(0, 20),
  displayName: 'Auth Smoke',
  password,
};

const registered = await api('POST', '/auth/register', { body: account });
check(registered.status === 201 && registered.json?.accessToken, 'password user registers');
const accessToken = registered.json?.accessToken;
const userId = registered.json?.userId;

const me = await api('GET', '/users/me', { token: accessToken });
check(me.status === 200 && me.json?.oauthProvider === null && me.json?.twoFactorEnabled === false,
  'password user profile has no OAuth provider and 2FA off');
check(!leaksSecret(me), 'profile hides password hash and 2FA secret');

const wrongPassword = await api('POST', '/auth/login', { body: { email: account.email, password: 'wrong-password' } });
check(wrongPassword.status === 401, 'wrong password is rejected');

const firstSecret = await api('POST', '/auth/2fa/generate', { token: accessToken });
const generated = await api('POST', '/auth/2fa/generate', { token: accessToken });
const secret = generated.json?.secret;
check(generated.status === 201 && secret && secret !== firstSecret.json?.secret,
  'unconfirmed 2FA secret can be regenerated');
const expectedQr = secret
  ? await toDataURL(authenticator.keyuri(account.email, 'ft_transcendence', secret))
  : null;
check(expectedQr && generated.json?.qrCodeDataUrl === expectedQr,
  'QR image encodes the otpauth URI for this account and secret');

const badEnable = await api('POST', '/auth/2fa/turn-on', { token: accessToken, body: { code: '000000' } });
check(badEnable.status === 401, 'wrong code does not enable 2FA');
const enabled = await api('POST', '/auth/2fa/turn-on', {
  token: accessToken, body: () => ({ code: authenticator.generate(secret) }),
});
check(enabled.status === 201 && !leaksSecret(enabled, secret), 'valid TOTP enables 2FA without echoing the secret');
const regenerateWhileEnabled = await api('POST', '/auth/2fa/generate', { token: accessToken });
check(regenerateWhileEnabled.status === 409, 'secret cannot be replaced while 2FA is enabled');

const challenged = await api('POST', '/auth/login', { body: { email: account.email, password } });
const tempToken = challenged.json?.tempToken;
check(challenged.status === 200 && challenged.json?.require2FA === true && tempToken && !challenged.json?.accessToken,
  'password login with 2FA returns only a challenge');

const tempAsBearer = await api('GET', '/users/me', { token: tempToken });
check(tempAsBearer.status === 401, '2FA challenge token is rejected as an HTTP access token');
check(!await socketAuthenticates(tempToken, userId), '2FA challenge token is rejected as a WebSocket token');

const badCode = await api('POST', '/auth/2fa/authenticate', { body: { userId, tempToken, code: '000000' } });
check(badCode.status === 401, 'wrong TOTP does not complete 2FA login');
const completed = await api('POST', '/auth/2fa/authenticate', {
  body: () => ({ userId, tempToken, code: authenticator.generate(secret) }),
});
const secondFactorToken = completed.json?.accessToken;
check(completed.status === 200 && secondFactorToken && !leaksSecret(completed, secret), 'valid TOTP completes login');
const afterSecondFactor = await api('GET', '/users/me', { token: secondFactorToken });
check(afterSecondFactor.status === 200 && afterSecondFactor.json?.twoFactorEnabled === true,
  'access token from 2FA login works');
check(await socketAuthenticates(secondFactorToken, userId), 'access token authenticates the WebSocket');

const badDisable = await api('POST', '/auth/2fa/turn-off', { token: secondFactorToken, body: { code: '000000' } });
check(badDisable.status === 401, 'wrong code does not disable 2FA');
const disabled = await api('POST', '/auth/2fa/turn-off', {
  token: secondFactorToken, body: () => ({ code: authenticator.generate(secret) }),
});
check(disabled.status === 201, `valid TOTP disables 2FA (HTTP ${disabled.status})`);
const plainLogin = await api('POST', '/auth/login', { body: { email: account.email, password } });
check(plainLogin.status === 200 && plainLogin.json?.accessToken && !plainLogin.json?.require2FA,
  `login after disabling 2FA issues tokens directly (HTTP ${plainLogin.status})`);

if (oauthEmail) {
  const oauthPasswordLogin = await api('POST', '/auth/login', { body: { email: oauthEmail, password } });
  check(oauthPasswordLogin.status === 401 && oauthPasswordLogin.json?.message === wrongPassword.json?.message,
    `OAuth-only user cannot log in with a password and gets the generic error (HTTP ${oauthPasswordLogin.status})`);
} else {
  console.log('SKIP OAuth-only password login (set AUTH_SMOKE_OAUTH_EMAIL)');
}

console.log(`INFO created user ${account.username} (${userId}); waited out ${rateLimitedRetries} auth rate-limit responses`);
if (failures.length) {
  throw new Error(`Auth smoke test failed:\n  ${failures.join('\n  ')}`);
}
