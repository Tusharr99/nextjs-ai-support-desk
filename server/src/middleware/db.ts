import mongoose from 'mongoose';

/**
 * Returns true if Mongoose is currently connected to MongoDB.
 */
export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Attempts a reconnect if disconnected. Safe to call on every request.
 */
export async function ensureDbConnected(): Promise<boolean> {
  if (isDbConnected()) return true;

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) return false;

  try {
    mongoose.set('bufferTimeoutMS', 2000); // Fail fast instead of hanging 30s
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 6000,
    });
    console.log('✅ MongoDB reconnected');
    return true;
  } catch {
    return false;
  }
}
