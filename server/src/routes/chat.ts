import { Router, Request, Response } from 'express';
import { CohereClient } from 'cohere-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import { ChatSession, Message } from '../models';
import { ensureDbConnected } from '../middleware/db';

const router = Router();

// ─── Constants ─────────────────────────────────────────────────────────────────
const SIMILARITY_THRESHOLD = 0.4;
const TOP_K_RESULTS = 3;

// ─── Cohere client (singleton) ─────────────────────────────────────────────────
function getCohere() {
  return new CohereClient({ token: process.env.COHERE_API_KEY! });
}

// ─── Pinecone index (singleton pattern) ────────────────────────────────────────
async function getPineconeIndex() {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  return pinecone.index(process.env.PINECONE_INDEX || 'nextjs-docs');
}

// ─── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const { sessionId, message } = req.body as { sessionId?: string; message: string };

  if (!message?.trim()) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: object) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let currentSessionId: string;

  try {
    const dbReady = await ensureDbConnected();
    const cohere = getCohere();

    // ── Session ───────────────────────────────────────────────────────────────
    if (dbReady) {
      let session = null;
      if (sessionId && mongoose.Types.ObjectId.isValid(sessionId))
        session = await ChatSession.findById(sessionId);
      if (!session)
        session = await ChatSession.create({ status: 'active', summary: message.slice(0, 100) });
      currentSessionId = (session as { _id: mongoose.Types.ObjectId })._id.toString();
    } else {
      currentSessionId = sessionId || `temp-${Date.now()}`;
    }

    sendEvent('session', { sessionId: currentSessionId });

    if (dbReady) {
      await Message.create({ sessionId: currentSessionId, sender: 'user', text: message, citations: [] });
    }

    // ── Embed query ───────────────────────────────────────────────────────────
    let contextText = '';
    let citations: string[] = [];
    let topScore = 0;
    let isEscalated = false;

    try {
      const embedRes = await cohere.embed({
        texts: [message],
        model: 'embed-english-v3.0',
        inputType: 'search_query',
      });

      const queryVector = (embedRes.embeddings as number[][])[0];
      const index = await getPineconeIndex();

      const queryResult = await index.query({
        vector: queryVector,
        topK: TOP_K_RESULTS,
        includeMetadata: true,
      });

      const matches = queryResult.matches ?? [];
      if (matches.length > 0) {
        topScore = matches[0].score ?? 0;
        isEscalated = topScore < SIMILARITY_THRESHOLD;

        if (!isEscalated) {
          contextText = matches
            .map((m, i) => `[${i + 1}] ${(m.metadata?.text as string) ?? ''}`)
            .join('\n\n---\n\n');
          citations = [...new Set(
            matches
              .map(m => (m.metadata?.source_file as string) ?? '')
              .filter(Boolean)
          )];
        }
      } else {
        isEscalated = true;
      }
    } catch (vectorErr) {
      console.error('Vector search error:', vectorErr);
      isEscalated = true;
    }

    // ── Escalation ────────────────────────────────────────────────────────────
    if (isEscalated) {
      if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId))
        await ChatSession.findByIdAndUpdate(currentSessionId, { status: 'escalated' });

      const escalationText =
        "I don't have enough information in the documentation to confidently answer your question. " +
        'Your query has been escalated to our human support team who will review it shortly.';

      sendEvent('escalated', { message: 'Escalated to human support.' });
      if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
        await Message.create({
          sessionId: currentSessionId, sender: 'ai',
          text: escalationText, citations: [], similarityScore: topScore,
        });
      }
      sendEvent('token', { content: escalationText });
      sendEvent('done', { citations: [], sessionId: currentSessionId });
      res.end();
      return;
    }

    // ── Stream chat response via Cohere command-r ─────────────────────────────
    const systemPrompt =
      `You are an expert Next.js Technical Support Engineer. ` +
      `Answer the user's question accurately using ONLY the provided documentation context. ` +
      `Be concise, technical, and helpful. Format code with markdown code blocks.\n\n` +
      `## Documentation Context:\n${contextText}`;

    const stream = await cohere.chatStream({
      model: 'command-r-08-2024',
      message,
      preamble: systemPrompt,
      temperature: 0.2,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.eventType === 'text-generation' && chunk.text) {
        fullResponse += chunk.text;
        sendEvent('token', { content: chunk.text });
      }
    }

    if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
      await Message.create({
        sessionId: currentSessionId, sender: 'ai',
        text: fullResponse, citations, similarityScore: topScore,
      });
    }

    sendEvent('done', { citations, sessionId: currentSessionId });
    res.end();
  } catch (error) {
    console.error('Chat route error:', error);
    sendEvent('error', { message: error instanceof Error ? error.message : 'Unexpected error' });
    res.end();
  }
});

// ─── GET /api/sessions ─────────────────────────────────────────────────────────
router.get('/sessions', async (_req: Request, res: Response): Promise<void> => {
  const dbReady = await ensureDbConnected();
  if (!dbReady) { res.json({ sessions: [], _warning: 'Database not connected' }); return; }
  try {
    const sessions = await ChatSession.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ sessions });
  } catch {
    res.json({ sessions: [], _error: 'Failed to fetch sessions' });
  }
});

// ─── GET /api/sessions/:id/messages ───────────────────────────────────────────
router.get('/sessions/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid session ID' }); return; }
  const dbReady = await ensureDbConnected();
  if (!dbReady) { res.json({ messages: [], _warning: 'Database not connected' }); return; }
  try {
    const messages = await Message.find({ sessionId: id }).sort({ createdAt: 1 }).lean();
    res.json({ messages });
  } catch {
    res.json({ messages: [], _error: 'Failed to fetch messages' });
  }
});

// ─── GET /api/admin/escalated ──────────────────────────────────────────────────
router.get('/admin/escalated', async (_req: Request, res: Response): Promise<void> => {
  const dbReady = await ensureDbConnected();
  if (!dbReady) { res.json({ sessions: [], _warning: 'Database not connected' }); return; }
  try {
    const escalated = await ChatSession.find({ status: 'escalated' }).sort({ createdAt: -1 }).lean();
    const sessionsWithMessages = await Promise.all(
      escalated.map(async s => ({
        ...s,
        messages: await Message.find({ sessionId: s._id }).sort({ createdAt: 1 }).lean(),
      }))
    );
    res.json({ sessions: sessionsWithMessages });
  } catch {
    res.json({ sessions: [], _error: 'Failed to fetch escalated sessions' });
  }
});

// ─── PATCH /api/admin/sessions/:id/resolve ─────────────────────────────────────
router.patch('/admin/sessions/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { resolution } = req.body as { resolution: string };
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid session ID' }); return; }
  if (!resolution) { res.status(400).json({ error: 'Resolution text is required' }); return; }
  try {
    const updated = await ChatSession.findByIdAndUpdate(id, { status: 'active', adminResolution: resolution }, { new: true });
    if (!updated) { res.status(404).json({ error: 'Session not found' }); return; }
    await Message.create({ sessionId: id, sender: 'ai', text: `**Admin Resolution:** ${resolution}`, citations: [] });
    res.json({ session: updated, message: 'Session resolved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve session' });
  }
});

export default router;
