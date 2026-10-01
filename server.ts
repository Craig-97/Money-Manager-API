import { connectToDatabase } from './db/mongodb';
import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config({ quiet: true });

const startServer = async () => {
  const { httpServer } = await createApp();

  await connectToDatabase();

  const PORT = process.env.PORT || 4000;
  await new Promise<void>(resolve => httpServer.listen({ port: PORT }, resolve));
  console.log(`🚀 Server running on ${PORT}`);
};

startServer();
