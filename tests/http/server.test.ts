import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  gqlRaw,
  agent
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

describe('http layer', () => {
  const preflight = (origin: string) =>
    agent()
      .options('/graphql')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

  it('answers a preflight from the front-end origin and allows its cookies', async () => {
    const res = await preflight('http://localhost:5173');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toBe('POST,GET,OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type,Authorization');
  });

  it('allows the origins listed in CORS_ORIGINS', async () => {
    process.env.CORS_ORIGINS = 'https://a.example.com, https://b.example.com/';
    try {
      await teardownTestApp();
      await setupTestApp();
      expect((await preflight('https://b.example.com')).headers['access-control-allow-origin']).toBe(
        'https://b.example.com'
      );
    } finally {
      delete process.env.CORS_ORIGINS;
    }
  });

  it('does not allow any other origin', async () => {
    const res = await preflight('https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a 400 for an invalid query', async () => {
    const res = await gqlRaw('{ doesNotExist }');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
  });

  it('serves the typename for a trivial query', async () => {
    const body = await gql('{ __typename }');
    expect(body.data).toEqual({ __typename: 'Query' });
  });
});
