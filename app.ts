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
import { formatError } from './utils/errors';

// CORS_ORIGINS is a comma-separated list of front-end origins; CLIENT_URL is always allowed too
const allowedOrigins = () =>
  [process.env.CORS_ORIGINS, process.env.CLIENT_URL ?? 'http://localhost:5173']
    .flatMap(value => (value ?? '').split(','))
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

// Builds the express app and Apollo server without listening or connecting to the database
export const createApp = async () => {
  const app = express();

  // Behind a proxy or load balancer the client IP comes from X-Forwarded-For, which rate limiting
  // relies on. TRUST_PROXY is the number of proxies in front of the API (or an Express trust proxy value)
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
  }

  // The browser app reaches the API through its own origin (a Netlify rewrite, or Vite's dev proxy),
  // so cross-origin requests are only for the origins listed here
  app.use(
    cors({
      origin: allowedOrigins(),
      credentials: true,
      methods: ['POST', 'GET', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  app.use(isAuth);

  const httpServer = http.createServer(app);
  const server = new ApolloServer({
    schema,
    formatError,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
  });

  await server.start();

  app.use(
    '/graphql',
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
