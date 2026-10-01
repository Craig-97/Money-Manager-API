import mongoose from 'mongoose';

export const connectToDatabase = () =>
  mongoose
    // A missing connection string is rejected by mongoose and logged by the catch below
    .connect(process.env.MONGODB_CONNECTION_STRING as string)
    .then(() => console.log('MongoDB has been connected'))
    .catch(err => console.log(err));
