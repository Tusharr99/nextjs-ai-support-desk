/**
 * RAG Ingestion Pipeline — scripts/ingest.ts
 *
 * Uses Cohere SDK directly (no LangChain wrapper — avoids version conflicts)
 * - Embeddings: embed-english-v3.0 (1024 dims, FREE)
 * - Vector DB:  Pinecone (direct SDK)
 *
 * Get free Cohere key at: https://dashboard.cohere.com/api-keys
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { CohereClient } from 'cohere-ai';
import { Pinecone } from '@pinecone-database/pinecone';

// ─── Configuration ─────────────────────────────────────────────────────────────
const DOCS_BASE_PATH = 'C:\\Users\\ASUS\\Desktop\\Nextjs doc\\next.js\\docs\\01-app';
const TARGET_SUBDIRS = ['01-getting-started', '02-guides', '03-api-reference'];
const MAX_FILES = 10;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH_SIZE = 96;   // Cohere max batch = 96 texts
const UPSERT_BATCH_SIZE = 100; // Pinecone max upsert = 100 vectors
const EMBED_DIM = 1024;        // embed-english-v3.0 dimension

// ─── Helpers ───────────────────────────────────────────────────────────────────
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += size - overlap;
  }
  return chunks;
}

function collectFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (files.length >= MAX_FILES) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, files);
    else if (/\.(md|mdx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, max = 5): Promise<T> {
  for (let i = 1; i <= max; i++) {
    try { return await fn(); }
    catch (err) {
      const msg = String(err);
      if ((msg.includes('429') || msg.includes('Too Many')) && i < max) {
        const wait = Math.min(2 ** i * 1000, 30000);
        console.warn(`  ⚠️  Rate limit on ${label}, waiting ${wait / 1000}s…`);
        await delay(wait);
      } else throw err;
    }
  }
  throw new Error(`${label} failed`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 RAG Ingestion Pipeline (Cohere + Pinecone — 100% FREE)\n');

  // Validate env
  if (!process.env.COHERE_API_KEY) {
    console.error('❌ COHERE_API_KEY missing! Get free key: https://dashboard.cohere.com/api-keys');
    process.exit(1);
  }
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
    console.error('❌ PINECONE_API_KEY or PINECONE_INDEX missing in .env');
    process.exit(1);
  }

  const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const indexName = process.env.PINECONE_INDEX;

  // ── Auto-create/fix Pinecone index ─────────────────────────────────────────
  console.log(`🌲 Checking Pinecone index "${indexName}"…`);
  const existing = (await pinecone.listIndexes()).indexes ?? [];
  const found = existing.find(i => i.name === indexName);

  if (found) {
    if (found.dimension !== EMBED_DIM) {
      console.log(`⚠️  Index has wrong dimension (${found.dimension} ≠ ${EMBED_DIM}). Deleting…`);
      await pinecone.deleteIndex(indexName);
      await delay(3000);
    } else {
      console.log(`✅ Index "${indexName}" ready (${EMBED_DIM} dims)\n`);
    }
  }

  const afterDelete = (await pinecone.listIndexes()).indexes ?? [];
  if (!afterDelete.find(i => i.name === indexName)) {
    console.log(`⏳ Creating index "${indexName}" (${EMBED_DIM} dims, cosine)…`);
    await pinecone.createIndex({
      name: indexName,
      dimension: EMBED_DIM,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    for (let i = 0; i < 12; i++) {
      await delay(5000);
      const d = await pinecone.describeIndex(indexName);
      if (d.status?.ready) { console.log('✅ Index ready!\n'); break; }
      process.stdout.write(`  Waiting… ${(i + 1) * 5}s\r`);
    }
  }

  const index = pinecone.index(indexName);

  // ── Collect & chunk docs ───────────────────────────────────────────────────
  console.log(`📁 Scanning: ${DOCS_BASE_PATH}`);
  const allFiles: string[] = [];
  for (const sub of TARGET_SUBDIRS) {
    collectFiles(path.join(DOCS_BASE_PATH, sub), allFiles);
    if (allFiles.length >= MAX_FILES) break;
  }
  const files = allFiles.slice(0, MAX_FILES);
  console.log(`✅ Found ${files.length} files:`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${path.relative(DOCS_BASE_PATH, f)}`));

  interface Chunk { text: string; source: string; }
  const chunks: Chunk[] = [];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8');
    for (const c of chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP)) {
      if (c.trim().length > 50) chunks.push({ text: c, source: path.basename(f) });
    }
  }
  console.log(`\n✂️  Created ${chunks.length} chunks\n`);

  // ── Embed in batches ───────────────────────────────────────────────────────
  console.log(`🤖 Embedding with Cohere embed-english-v3.0…`);
  console.log(`💰 Cost: $0.00 (free trial)\n`);

  const allVectors: { id: string; values: number[]; metadata: Record<string, string> }[] = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE);

    process.stdout.write(`  🔢 Embedding batch ${batchNum}/${totalBatches} (${batch.length} chunks)…`);

    const response = await withRetry(
      () => cohere.embed({
        texts: batch.map(c => c.text),
        model: 'embed-english-v3.0',
        inputType: 'search_document',
      }),
      `embed batch ${batchNum}`
    );

    const embeddings = response.embeddings as number[][];
    for (let j = 0; j < batch.length; j++) {
      allVectors.push({
        id: `chunk-${Date.now()}-${i + j}`,
        values: embeddings[j],
        metadata: { text: batch[j].text.slice(0, 500), source_file: batch[j].source },
      });
    }
    process.stdout.write(' ✅\n');
    if (i + EMBED_BATCH_SIZE < chunks.length) await delay(500);
  }

  // ── Upsert to Pinecone ─────────────────────────────────────────────────────
  console.log(`\n📤 Upserting ${allVectors.length} vectors to Pinecone…`);
  const totalUpsertBatches = Math.ceil(allVectors.length / UPSERT_BATCH_SIZE);

  for (let i = 0; i < allVectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = allVectors.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    process.stdout.write(`  ⬆️  Upsert batch ${batchNum}/${totalUpsertBatches}…`);
    await withRetry(() => index.upsert(batch), `upsert ${batchNum}`);
    process.stdout.write(' ✅\n');
  }

  console.log('\n✅ ==============================');
  console.log('✅  Ingestion complete!');
  console.log('✅ ==============================');
  console.log(`📊 ${files.length} files | ${chunks.length} chunks | ${allVectors.length} vectors`);
}

main().catch(err => { console.error('\n❌ Failed:', err.message ?? err); process.exit(1); });
