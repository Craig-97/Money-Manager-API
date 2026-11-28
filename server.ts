import './env';
import { connectToDatabase } from './db/mongodb';
import { createApp } from './app';
import { logger } from './utils/logger';

const startServer = async () => {
  const { httpServer } = await createApp();

  await connectToDatabase();

  const PORT = process.env.PORT || 4000;
  await new Promise<void>(resolve => httpServer.listen({ port: PORT }, resolve));
  logger.info({ port: PORT }, 'Server running');
};

startServer();
