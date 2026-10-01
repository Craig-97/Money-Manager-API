const { MongoMemoryReplSet } = require('mongodb-memory-server');

// A replica set is required because the resolvers use multi-document transactions
module.exports = async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  global.__MONGO__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
