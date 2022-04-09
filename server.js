import { ApolloServer } from 'apollo-server-express';
import { schema } from './schema';
import express from 'express';
import { connectToDatabase } from './db/mongodb';

require('dotenv').config();

const startServer = async () => {
  const app = express();

  const server = new ApolloServer({
    schema
  });

  await server.start();
  server.applyMiddleware({ app });

  await connectToDatabase();

  const PORT = process.env.PORT || 4000;

  app.listen({ port: PORT }, () => console.log(`🚀 Server running on ${PORT}`));
};

startServer();
