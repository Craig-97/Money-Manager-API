import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { connectionString } from './connectionString';

export const connectToDatabase = () =>
  Promise.resolve()
    // A missing connection string is thrown here and logged by the catch below
    .then(() => mongoose.connect(connectionString().uri))
    .then(() => logger.info({ database: mongoose.connection.name }, 'MongoDB has been connected'))
    .catch(err => logger.error({ err }, 'MongoDB connection failed'));
