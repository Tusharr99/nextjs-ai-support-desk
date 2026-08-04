import { Router, Request, Response } from 'express';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import mongoose from 'mongoose';
import { ChatSession, Message } from '../models';

const router = Router();

// ─── Constants ─────────────────────────────────────────────────────────────────
const SIMILARITY_THRESHOLD = 0.3;
const TOP_K_RESULTS = 3;

const SYSTEM_PROMPT = `You are an expert Next.js Technical Support Engineer. 
Answer the user's question accurately using ONLY the provided documentation context. 
If the context does not contain the answer, state that you do not have enough information.
Be concise, technical, and helpful. Format code examples with proper markdown code blocks.`;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
}

async function getPineconeStore(): Promise<PineconeStore> {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const index = pinecone.index(process.env.PINECONE_INDEX || 'nextjs-docs');

  return PineconeStore.fromExistingIndex(getEmbeddings(), {
    pineconeIndex: index,
  });
}

// ─── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const { sessionId, message } = req.body as {
    sessionId?: string;
    message: string;
  };

  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // ── Set up SSE headers ──────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: object): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let session: mongoose.Document | null = null;
  let currentSessionId: string;

  try {
    // ── Resolve or create chat session ────────────────────────────────────────
    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      session = await ChatSession.findById(sessionId);
    }

    if (!session) {
      session = await ChatSession.create({
        status: 'active',
        summary: message.slice(0, 100),
      });
    }

    currentSessionId = (session as mongoose.Document & { _id: mongoose.Types.ObjectId })._id.toString();
    sendEvent('session', { sessionId: currentSessionId });

    // ── Save user message ─────────────────────────────────────────────────────
    await Message.create({
      sessionId: currentSessionId,
      sender: 'user',
      text: message,
      citations: [],
    });

    // ── Vector search ─────────────────────────────────────────────────────────
    let contextText = '';
    let citations: string[] = [];
    let topScore = 0;
    let isEscalated = false;

    try {
      const vectorStore = await getPineconeStore();
      const results = await vectorStore.similaritySearchWithScore(
        message,
        TOP_K_RESULTS
      );

      if (results.length > 0) {
        topScore = results[0][1];
        isEscalated = topScore < SIMILARITY_THRESHOLD;

        if (!isEscalated) {
          contextText = results
            .map(([doc], i) => `[${i + 1}] ${doc.pageContent}`)
            .join('\n\n---\n\n');

          citations = [
            ...new Set(
              results
                .map(([doc]) => {
                  const src = doc.metadata?.source_file as string | undefined;
                  return src ? src.split(/[\\/]/).pop() || src : '';
                })
                .filter(Boolean)
            ),
          ];
        }
      } else {
        isEscalated = true;
      }
    } catch (vectorErr) {
      console.error('Vector search error:', vectorErr);
      isEscalated = true;
    }

    // ── Escalation handling ───────────────────────────────────────────────────
    if (isEscalated) {
      await ChatSession.findByIdAndUpdate(currentSessionId, {
        status: 'escalated',
      });

      sendEvent('escalated', {
        message:
          'This question has been escalated to our human support team. You will be notified when an expert responds.',
      });

      const escalationText =
        "I don't have enough information in the documentation to confidently answer your question. " +
        'Your query has been escalated to our human support team who will review it shortly.';

      await Message.create({
        sessionId: currentSessionId,
        sender: 'ai',
        text: escalationText,
        citations: [],
        similarityScore: topScore,
      });

      sendEvent('token', { content: escalationText });
      sendEvent('done', { citations: [], sessionId: currentSessionId });
      res.end();
      return;
    }

    // ── Build messages ────────────────────────────────────────────────────────
    const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n## Documentation Context:\n${contextText}`;

    const llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      openAIApiKey: process.env.OPENAI_API_KEY,
      streaming: true,
      temperature: 0.2,
    });

    // ── Stream response token by token ────────────────────────────────────────
    let fullResponse = '';

    const stream = await llm.stream([
      new SystemMessage(fullSystemPrompt),
      new HumanMessage(message),
    ]);

    for await (const chunk of stream) {
      const token =
        typeof chunk.content === 'string' ? chunk.content : '';
      if (token) {
        fullResponse += token;
        sendEvent('token', { content: token });
      }
    }

    // ── Persist AI message to MongoDB ─────────────────────────────────────────
    await Message.create({
      sessionId: currentSessionId,
      sender: 'ai',
      text: fullResponse,
      citations,
      similarityScore: topScore,
    });

    sendEvent('done', { citations, sessionId: currentSessionId });
    res.end();
  } catch (error) {
    console.error('Chat route error:', error);

    const errMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    sendEvent('error', { message: errMessage });
    res.end();
  }
});

// ─── GET /api/sessions ─────────────────────────────────────────────────────────
router.get('/sessions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await ChatSession.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ sessions });
  } catch (error) {
    console.error('Sessions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ─── GET /api/sessions/:id/messages ───────────────────────────────────────────
router.get(
  '/sessions/:id/messages',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    try {
      const messages = await Message.find({ sessionId: id })
        .sort({ createdAt: 1 })
        .lean();

      res.json({ messages });
    } catch (error) {
      console.error('Messages fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
);

// ─── GET /api/admin/escalated ──────────────────────────────────────────────────
router.get(
  '/admin/escalated',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const escalatedSessions = await ChatSession.find({
        status: 'escalated',
      })
        .sort({ createdAt: -1 })
        .lean();

      const sessionsWithMessages = await Promise.all(
        escalatedSessions.map(async (session) => {
          const messages = await Message.find({ sessionId: session._id })
            .sort({ createdAt: 1 })
            .lean();
          return { ...session, messages };
        })
      );

      res.json({ sessions: sessionsWithMessages });
    } catch (error) {
      console.error('Admin escalated fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch escalated sessions' });
    }
  }
);

// ─── PATCH /api/admin/sessions/:id/resolve ─────────────────────────────────────
router.patch(
  '/admin/sessions/:id/resolve',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { resolution } = req.body as { resolution: string };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }

    if (!resolution || typeof resolution !== 'string') {
      res.status(400).json({ error: 'Resolution text is required' });
      return;
    }

    try {
      const updated = await ChatSession.findByIdAndUpdate(
        id,
        { status: 'active', adminResolution: resolution },
        { new: true }
      );

      if (!updated) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Save the resolution as an AI message
      await Message.create({
        sessionId: id,
        sender: 'ai',
        text: `**Admin Resolution:** ${resolution}`,
        citations: [],
      });

      res.json({ session: updated, message: 'Session resolved successfully' });
    } catch (error) {
      console.error('Admin resolve error:', error);
      res.status(500).json({ error: 'Failed to resolve session' });
    }
  }
);

export default router;
