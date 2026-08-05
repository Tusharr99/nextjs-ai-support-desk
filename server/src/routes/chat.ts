import { Router, Request, Response } from 'express';
import { CohereClient } from 'cohere-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import { ChatSession, Message } from '../models';
import { ensureDbConnected } from '../middleware/db';

const router = Router();

// ─── Constants ─────────────────────────────────────────────────────────────────
const SIMILARITY_THRESHOLD = 0.35;
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
      try {
        let session = null;
        if (sessionId && mongoose.Types.ObjectId.isValid(sessionId))
          session = await ChatSession.findById(sessionId);
        if (!session)
          session = await ChatSession.create({ status: 'active', summary: message.slice(0, 100) });
        currentSessionId = (session as { _id: mongoose.Types.ObjectId })._id.toString();
      } catch (err) {
        console.error('Session DB Error, falling back to memory:', err);
        currentSessionId = sessionId || `temp-${Date.now()}`;
      }
    } else {
      currentSessionId = sessionId || `temp-${Date.now()}`;
    }

    sendEvent('session', { sessionId: currentSessionId });

    if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
      try {
        await Message.create({ sessionId: currentSessionId, sender: 'user', text: message, citations: [] });
      } catch (err) {
        console.error('Failed to log user message:', err);
      }
    }

    // ── Intent Classifier ─────────────────────────────────────────────────────
    let intent = 'TECHNICAL_QUERY';
    try {
      const routerPrompt = `You are an intent classifier for a Next.js AI support desk. Categorize the user's message into one of three intents:
- "SMALL_TALK": Greetings, casual conversation, who you are, or vague/general requests for help (e.g., "can you help me", "i need help", "how do i use this bot?", "are you there?").
- "TECHNICAL_QUERY": Technical help, code examples related to Next.js/React.
- "OUT_OF_SCOPE": Completely unrelated to software development.
Respond with a JSON object in this format: {"intent": "..."}`;

      const classifyRes = await cohere.chat({
        model: 'command-r-08-2024',
        message: message,
        preamble: routerPrompt,
        // @ts-ignore
        responseFormat: { type: 'json_object' }
      });
      
      const jsonStr = classifyRes.text || '{}';
      const parsed = JSON.parse(jsonStr);
      if (parsed.intent) intent = parsed.intent;
    } catch (err) {
      console.error('Classification error:', err);
      // fallback to technical query on error
    }

    if (intent === 'SMALL_TALK') {
      const reply = "I sure can! I'm an expert on Next.js, React, routing, server components, and configuration. What specific question or issue can I help you with today?";
      sendEvent('token', { content: reply });
      sendEvent('done', { citations: [], sessionId: currentSessionId });
      
      if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
        try { await Message.create({ sessionId: currentSessionId, sender: 'ai', text: reply, citations: [], similarityScore: 1 }); } catch(e) {}
      }
      res.end();
      return;
    }

    if (intent === 'OUT_OF_SCOPE') {
      const reply = "I am specifically designed to assist with Next.js technical support and cannot help with non-development questions.";
      sendEvent('token', { content: reply });
      sendEvent('done', { citations: [], sessionId: currentSessionId });
      
      if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
        try { await Message.create({ sessionId: currentSessionId, sender: 'ai', text: reply, citations: [], similarityScore: 1 }); } catch(e) {}
      }
      res.end();
      return;
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
      const escalationText =
        "I don't have enough information in the documentation to confidently answer your question. " +
        'Your query has been escalated to our human support team who will review it shortly.';

      // Await all DB operations BEFORE sending any responses to the client
      if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
        try { 
          await ChatSession.findByIdAndUpdate(currentSessionId, { status: 'escalated' }); 
          await Message.create({
            sessionId: currentSessionId, sender: 'ai',
            text: escalationText, citations: [], similarityScore: topScore,
          });
        } catch(e) {
          console.error('Failed to update DB for escalation:', e);
        }
      }

      sendEvent('escalated', { message: 'Escalated to human support.' });
      sendEvent('token', { content: escalationText });
      sendEvent('done', { citations: [], sessionId: currentSessionId });
      res.end();
      return;
    }

    // ── Stream chat response via Cohere command-r ─────────────────────────────
    const systemPrompt =
      `You are an expert Next.js Technical Support Engineer. Answer the user's question using ONLY the provided documentation context below.\n` +
      `- You MAY synthesize and explain concepts found in the context, even if the exact phrase isn't present verbatim.\n` +
      `- Use clear, concise language with markdown formatting and code blocks where helpful.\n` +
      `- If the context genuinely contains NO relevant information at all to answer the question, reply with ONLY: 'I don't have enough information in the documentation to confidently answer your question. Your query has been escalated to our human support team who will review it shortly.'\n` +
      `- Do NOT make up APIs, features, or configurations not present in the context.\n\n` +
      `## Documentation Context:\n${contextText}`;

    const stream = await cohere.chatStream({
      model: 'command-r-08-2024',
      message,
      preamble: systemPrompt,
      temperature: 0.1,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.eventType === 'text-generation' && chunk.text) {
        fullResponse += chunk.text;
        sendEvent('token', { content: chunk.text });
      }
    }

    if (dbReady && mongoose.Types.ObjectId.isValid(currentSessionId)) {
      try {
        await Message.create({
          sessionId: currentSessionId, sender: 'ai',
          text: fullResponse, citations, similarityScore: topScore,
        });

        // If the LLM strictly fell back to the escalation phrase, mark the session as escalated
        if (fullResponse.includes("I don't have enough information")) {
          await ChatSession.findByIdAndUpdate(currentSessionId, { status: 'escalated' });
          console.log('Escalation saved to DB for session:', currentSessionId);
        }
      } catch (err) {
        console.error('Failed to log AI response:', err);
      }
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
  if (!mongoose.Types.ObjectId.isValid(id)) { res.json({ messages: [], _warning: 'Invalid or temporary session ID' }); return; }
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
