import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  gqlRaw,
  errorCode,
  refreshCookieFrom,
  createUserWithAccount
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const LOGIN = `mutation ($email: String!, $password: String!) {
  login(email: $email, password: $password) { token user { id email } }
}`;
const REFRESH = `mutation { refreshSession { token user { id email } } }`;
const LOGOUT = `mutation { logout { success } }`;
const CHANGE_PASSWORD = `mutation ($current: String!, $next: String!) {
  changePassword(currentPassword: $current, newPassword: $next) { success }
}`;
const PREFERENCES = `mutation ($theme: ThemePreference, $accent: String) {
  updatePreferences(theme: $theme, accent: $accent) { user { theme accent } }
}`;

const signIn = async () => {
  const { email, password } = await createUserWithAccount({ withAccount: false });
  const res = await gqlRaw(LOGIN, { email, password });
  return { email, password, res, cookie: refreshCookieFrom(res) as string };
};

describe('refresh cookie', () => {
  it('is set on login as an httpOnly cookie sent only to /graphql', async () => {
    const { res } = await signIn();
    const header = (res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('mm_refresh='));
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\/graphql/);
    expect(header).toMatch(/Max-Age=2592000/);
  });

  it('is not in the response body', async () => {
    const { res, cookie } = await signIn();
    expect(JSON.stringify(res.body)).not.toContain(cookie.split('=')[1]);
  });
});

describe('refreshSession', () => {
  it('returns a new access token and replaces the cookie', async () => {
    const { email, cookie } = await signIn();
    const res = await gqlRaw(REFRESH, undefined, undefined, cookie);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.refreshSession.user.email).toBe(email);
    expect(res.body.data.refreshSession.token).toEqual(expect.any(String));
    const next = refreshCookieFrom(res);
    expect(next).toBeDefined();
    expect(next).not.toBe(cookie);
  });

  it('gives an access token that works', async () => {
    const { cookie } = await signIn();
    const { body } = await gqlRaw(REFRESH, undefined, undefined, cookie);
    const me = await gql(`{ tokenFindUser { email } }`, undefined, body.data.refreshSession.token);
    expect(me.errors).toBeUndefined();
  });

  it('works once, so a copied cookie is useless after the real one is used', async () => {
    const { cookie } = await signIn();
    expect((await gqlRaw(REFRESH, undefined, undefined, cookie)).body.errors).toBeUndefined();
    expect(errorCode((await gqlRaw(REFRESH, undefined, undefined, cookie)).body)).toBe('UNAUTHENTICATED');
  });

  it('rejects a request without the cookie', async () => {
    expect(errorCode(await gql(REFRESH))).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown cookie', async () => {
    expect(errorCode(await gql(REFRESH, undefined, undefined, 'mm_refresh=nope'))).toBe('UNAUTHENTICATED');
  });

  it('keeps each device signed in separately', async () => {
    const { email, password, cookie } = await signIn();
    const other = refreshCookieFrom(await gqlRaw(LOGIN, { email, password })) as string;
    expect((await gqlRaw(REFRESH, undefined, undefined, cookie)).body.errors).toBeUndefined();
    expect((await gqlRaw(REFRESH, undefined, undefined, other)).body.errors).toBeUndefined();
  });
});

describe('logout', () => {
  it('ends this session and clears the cookie', async () => {
    const { cookie } = await signIn();
    const res = await gqlRaw(LOGOUT, undefined, undefined, cookie);
    expect(res.body.data.logout.success).toBe(true);
    expect((res.headers['set-cookie'] as unknown as string[]).join()).toMatch(/mm_refresh=;/);
    expect(errorCode((await gqlRaw(REFRESH, undefined, undefined, cookie)).body)).toBe('UNAUTHENTICATED');
  });

  it('succeeds without a session', async () => {
    expect((await gql(LOGOUT)).data.logout.success).toBe(true);
  });
});

describe('changing the password', () => {
  it('signs out other devices but gives this one a fresh session', async () => {
    const { email, password, res, cookie } = await signIn();
    const other = refreshCookieFrom(await gqlRaw(LOGIN, { email, password })) as string;
    const change = await gqlRaw(
      CHANGE_PASSWORD,
      { current: password, next: 'NewPassword1' },
      res.body.data.login.token,
      cookie
    );
    expect(change.body.errors).toBeUndefined();
    const fresh = refreshCookieFrom(change) as string;
    expect(fresh).toBeDefined();
    expect(errorCode((await gqlRaw(REFRESH, undefined, undefined, other)).body)).toBe('UNAUTHENTICATED');
    expect(errorCode((await gqlRaw(REFRESH, undefined, undefined, cookie)).body)).toBe('UNAUTHENTICATED');
    expect((await gqlRaw(REFRESH, undefined, undefined, fresh)).body.errors).toBeUndefined();
  });
});

describe('updatePreferences', () => {
  it('has no theme or accent until one is chosen', async () => {
    const { res } = await signIn();
    const me = await gql(`{ tokenFindUser { theme accent } }`, undefined, res.body.data.login.token);
    expect(me.data.tokenFindUser).toEqual({ theme: null, accent: null });
  });

  it('saves a theme and accent, and a later change leaves the other alone', async () => {
    const { res } = await signIn();
    const token = res.body.data.login.token;
    const first = await gql(PREFERENCES, { theme: 'LIGHT', accent: '#3d6bf5' }, token);
    expect(first.data.updatePreferences.user).toEqual({ theme: 'LIGHT', accent: '#3D6BF5' });
    const second = await gql(PREFERENCES, { theme: 'SYSTEM' }, token);
    expect(second.data.updatePreferences.user).toEqual({ theme: 'SYSTEM', accent: '#3D6BF5' });
  });

  it.each(['red', '#fff', '#GGGGGG', 'javascript:alert(1)'])('rejects the accent %s', async accent => {
    const { res } = await signIn();
    expect(errorCode(await gql(PREFERENCES, { accent }, res.body.data.login.token))).toBe('INVALID_ACCENT');
  });

  it('needs a signed-in user', async () => {
    expect(errorCode(await gql(PREFERENCES, { theme: 'DARK' }))).toBe('UNAUTHENTICATED');
  });
});
