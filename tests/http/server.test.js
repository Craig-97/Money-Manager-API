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
  it('answers OPTIONS preflight with 200 and CORS headers', async () => {
    const res = await agent().options('/graphql');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('POST,GET,OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
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
