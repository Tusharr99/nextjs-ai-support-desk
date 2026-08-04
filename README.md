# NextDesk — AI Customer Support Desk for Next.js Developers

A production-ready AI-powered support desk built with RAG (Retrieval-Augmented Generation), streaming responses, and an admin escalation dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB Atlas (Mongoose) |
| Vector DB | Pinecone |
| AI | LangChain.js, OpenAI (`text-embedding-3-small`, `gpt-4o-mini`) |

## Project Structure

```
nextjs-ai-support-desk/
├── client/               # Next.js frontend
│   ├── app/
│   │   ├── page.tsx      # Main chat UI
│   │   └── admin/        # Admin escalation dashboard
│   ├── components/       # Reusable UI components
│   ├── hooks/            # useStream SSE hook
│   ├── lib/              # API client utilities
│   └── types/            # Shared TypeScript types
└── server/               # Express backend
    ├── src/
    │   ├── index.ts      # App entry point
    │   ├── models/       # Mongoose schemas
    │   └── routes/       # API routes
    └── scripts/
        └── ingest.ts     # RAG ingestion pipeline
```

## Setup

### 1. Server Setup

```bash
cd server
cp .env.example .env
# Fill in your API keys in .env
npm install
```

### 2. Run Ingestion Pipeline

```bash
cd server
npm run ingest
```

### 3. Start Development Servers

**Backend:**
```bash
cd server
npm run dev
```

**Frontend:**
```bash
cd client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Features

- 🤖 **RAG-powered answers** from official Next.js documentation
- ⚡ **Real-time streaming** — token-by-token response rendering
- 📚 **Citations** — every answer shows which docs were referenced
- 🔁 **Corrective RAG** — low-confidence answers escalate to human support
- 👨‍💼 **Admin Dashboard** — review and resolve escalated tickets
- 🌙 **Dark developer theme** — glassmorphism, smooth animations

## Environment Variables

See `server/.env.example` for all required variables.

| Variable | Description |
|----------|-------------|
| `PORT` | Express server port (default: 5000) |
| `MONGO_URI` | MongoDB Atlas connection string |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX` | Pinecone index name (`nextjs-docs`) |
