import { MongoMemoryReplSet } from 'mongodb-memory-server';

declare global {
  // eslint-disable-next-line no-var
  var __MONGO__: MongoMemoryReplSet | undefined;
}

// A replica set is required because the resolvers use multi-document transactions
export default async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  globalThis.__MONGO__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
