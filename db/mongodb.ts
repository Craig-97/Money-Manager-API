import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export const connectToDatabase = () =>
  mongoose
    // A missing connection string is rejected by mongoose and logged by the catch below
    .connect(process.env.MONGODB_CONNECTION_STRING as string)
    .then(() => logger.info('MongoDB has been connected'))
    .catch(err => logger.error({ err }, 'MongoDB connection failed'));
