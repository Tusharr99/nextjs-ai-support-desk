import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import chatRouter from './routes/chat';

dotenv.config();

// Give Mongoose more time to buffer operations while connecting
mongoose.set('bufferTimeoutMS', 30000);

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown';
  res.json({
    status: 'ok',
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', chatRouter);

// ─── Start listening FIRST, then connect to MongoDB ───────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  connectMongo();
});

async function connectMongo(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI not set — DB features will be unavailable');
    return;
  }

  let attempt = 0;
  const RETRY_DELAY_MS = 10000; // retry every 10 seconds indefinitely

  const tryConnect = async (): Promise<void> => {
    attempt++;
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
      });
      console.log(`✅ MongoDB connected successfully (attempt ${attempt})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt === 1) {
        // Only print the big warning banner once
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('⚠️   MongoDB not yet reachable — retrying every 10s…');
        console.error('     If using Atlas, ensure your IP is whitelisted:');
        console.error('     cloud.mongodb.com → Security → Network Access → 0.0.0.0/0');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('');
      } else {
        console.warn(`⏳ MongoDB retry #${attempt} failed: ${msg.slice(0, 80)}…`);
      }
      // Schedule next retry — the route-level ensureDbConnected() handles
      // per-request lazy reconnects, this loop just handles startup.
      setTimeout(() => { void tryConnect(); }, RETRY_DELAY_MS);
    }
  };

  void tryConnect();
}

export default app;
