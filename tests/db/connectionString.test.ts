import { connectionString } from '../../db/connectionString';

const saved = { ...process.env };

beforeEach(() => {
  process.env.MONGODB_CONNECTION_STRING = 'mongodb://live/money_manager';
  process.env.MONGODB_DEV_CONNECTION_STRING = 'mongodb://live/money_manager_dev';
});

afterEach(() => {
  process.env = { ...saved };
});

describe('connectionString', () => {
  it('uses the dev database anywhere but production', () => {
    process.env.NODE_ENV = 'development';
    expect(connectionString()).toEqual({
      variable: 'MONGODB_DEV_CONNECTION_STRING',
      uri: 'mongodb://live/money_manager_dev',
      live: false
    });
  });

  it('uses the live database in production', () => {
    process.env.NODE_ENV = 'production';
    expect(connectionString()).toMatchObject({ uri: 'mongodb://live/money_manager', live: true });
  });

  it('uses the live one when asked, as a migration does with --live', () => {
    process.env.NODE_ENV = 'development';
    expect(connectionString({ live: true })).toMatchObject({ uri: 'mongodb://live/money_manager' });
  });

  it("stops rather than fall back to the live database when there's no dev one", () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MONGODB_DEV_CONNECTION_STRING;
    expect(() => connectionString()).toThrow('MONGODB_DEV_CONNECTION_STRING is not set');
  });
});
