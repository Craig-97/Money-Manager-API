import mongoose from 'mongoose';

export const connectToDatabase = () =>
  mongoose
    .connect(process.env.MONGODB_CONNECTION_STRING, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false
    })
    .then(() => console.log('MongoDB has been connected'))
    .catch(err => console.log(err));
