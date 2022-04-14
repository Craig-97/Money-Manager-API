import { ApolloServer } from 'apollo-server-express';
import bodyParser from 'body-parser';
import express from 'express';
import { connectToDatabase } from './db/mongodb';
import { isAuth } from './middleware/isAuth';
import { schema } from './schema';

require('dotenv').config();

const startServer = async () => {
  const app = express();

  app.use(bodyParser.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(isAuth);

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
