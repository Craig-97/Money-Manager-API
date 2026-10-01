import { connectToDatabase } from './db/mongodb';
import { createApp } from './app';

require('dotenv').config();

const startServer = async () => {
  const { httpServer } = await createApp();

  await connectToDatabase();

  const PORT = process.env.PORT || 4000;
  await new Promise(resolve => httpServer.listen({ port: PORT }, resolve));
  console.log(`🚀 Server running on ${PORT}`);
};

startServer();
