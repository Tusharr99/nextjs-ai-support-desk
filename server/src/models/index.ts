import mongoose, { Document, Schema } from 'mongoose';

// ─── Interfaces ────────────────────────────────────────────────────────────────
export interface IChatSession extends Document {
  status: 'active' | 'escalated';
  summary: string;
  adminResolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  sessionId: mongoose.Types.ObjectId;
  sender: 'user' | 'ai';
  text: string;
  citations: string[];
  similarityScore?: number;
  createdAt: Date;
}

// ─── ChatSession Schema ────────────────────────────────────────────────────────
const chatSessionSchema = new Schema<IChatSession>(
  {
    status: {
      type: String,
      enum: ['active', 'escalated'],
      default: 'active',
    },
    summary: {
      type: String,
      default: '',
    },
    adminResolution: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Message Schema ────────────────────────────────────────────────────────────
const messageSchema = new Schema<IMessage>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: true,
      index: true,
    },
    sender: {
      type: String,
      enum: ['user', 'ai'],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    citations: {
      type: [String],
      default: [],
    },
    similarityScore: {
      type: Number,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Models ────────────────────────────────────────────────────────────────────
export const ChatSession =
  mongoose.models.ChatSession ||
  mongoose.model<IChatSession>('ChatSession', chatSessionSchema);

export const Message =
  mongoose.models.Message ||
  mongoose.model<IMessage>('Message', messageSchema);
