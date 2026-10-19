export const LIVE_DATABASE = 'MONGODB_CONNECTION_STRING';
export const DEV_DATABASE = 'MONGODB_DEV_CONNECTION_STRING';

/*
 * Which database to connect to: the live one in production, the dev copy everywhere else, so
 * running the API or a script on this machine can't touch live data by accident. `live` picks the
 * live one on purpose, e.g. running a migration at deploy. A missing string is an error, never a
 * quiet fall back to the other database.
 */
export const connectionString = ({ live = process.env.NODE_ENV === 'production' } = {}) => {
  const variable = live ? LIVE_DATABASE : DEV_DATABASE;
  const uri = process.env[variable];
  if (!uri) throw new Error(`${variable} is not set`);
  return { variable, uri, live };
};
