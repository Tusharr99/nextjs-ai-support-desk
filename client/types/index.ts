// ─── API & Chat Types ──────────────────────────────────────────────────────────

export interface ChatSession {
  _id: string;
  status: 'active' | 'escalated';
  summary: string;
  adminResolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  _id: string;
  sessionId: string;
  sender: 'user' | 'ai';
  text: string;
  citations: string[];
  similarityScore?: number;
  createdAt: string;
}

// ─── SSE Event Payloads ────────────────────────────────────────────────────────

export interface SSESessionEvent {
  sessionId: string;
}

export interface SSETokenEvent {
  content: string;
}

export interface SSEDoneEvent {
  citations: string[];
  sessionId: string;
}

export interface SSEEscalatedEvent {
  message: string;
}

export interface SSEErrorEvent {
  message: string;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export interface UIMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  citations: string[];
  isStreaming?: boolean;
  isEscalated?: boolean;
  timestamp: Date;
}

export interface StreamState {
  isStreaming: boolean;
  streamingText: string;
  currentSessionId: string | null;
  error: string | null;
}

// ─── Admin Types ───────────────────────────────────────────────────────────────

export interface EscalatedSession extends ChatSession {
  messages: ChatMessage[];
}
