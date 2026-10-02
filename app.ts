import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { json } from 'body-parser';
import { isAuth } from './middleware/isAuth';
import { createAuthRateLimit } from './middleware/rateLimit';
import { schema } from './schema';

// Builds the express app and Apollo server without listening or connecting to the database
export const createApp = async () => {
  const app = express();

  // Behind a proxy or load balancer the client IP comes from X-Forwarded-For, which rate limiting
  // relies on. TRUST_PROXY is the number of proxies in front of the API (or an Express trust proxy value)
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
  }

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

  const httpServer = http.createServer(app);
  const server = new ApolloServer({
    schema,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
  });

  await server.start();

  app.use(
    '/graphql',
    cors(),
    json(),
    createAuthRateLimit(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        return req;
      }
    })
  );

  return { app, httpServer, server };
};
