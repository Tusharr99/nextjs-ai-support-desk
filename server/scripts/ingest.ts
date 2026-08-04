/**
 * RAG Ingestion Pipeline — scripts/ingest.ts
 *
 * Scans Next.js documentation markdown files, chunks them, generates
 * embeddings using OpenAI text-embedding-3-small, and upserts into Pinecone.
 *
 * Max 25 files processed to stay within rate limits.
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';

// ─── Configuration ─────────────────────────────────────────────────────────────
const DOCS_BASE_PATH = 'C:\\Users\\ASUS\\Desktop\\Nextjs doc\\next.js\\docs\\01-app';
const TARGET_SUBDIRS = [
  '01-getting-started',
  '02-guides',
  '03-api-reference',
];
const MAX_FILES = 25;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// ─── File Scanner ──────────────────────────────────────────────────────────────
function collectMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

// ─── Document Loader ───────────────────────────────────────────────────────────
function loadDocument(filePath: string): Document {
  const content = fs.readFileSync(filePath, 'utf-8');
  return new Document({
    pageContent: content,
    metadata: {
      source_file: filePath,
    },
  });
}

// ─── Delay Helper ──────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main Ingestion Pipeline ───────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🚀 Starting RAG Ingestion Pipeline...');
  console.log(`📁 Scanning: ${DOCS_BASE_PATH}`);
  console.log(`📋 Target subdirs: ${TARGET_SUBDIRS.join(', ')}`);
  console.log(`📊 Max files: ${MAX_FILES}\n`);

  // ── Validate environment variables ─────────────────────────────────────────
  const requiredEnvVars = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // ── Collect markdown files ─────────────────────────────────────────────────
  const allFiles: string[] = [];

  for (const subdir of TARGET_SUBDIRS) {
    if (allFiles.length >= MAX_FILES) break;
    const targetPath = path.join(DOCS_BASE_PATH, subdir);
    collectMarkdownFiles(targetPath, allFiles);
  }

  const filesToProcess = allFiles.slice(0, MAX_FILES);

  console.log(`✅ Found ${filesToProcess.length} files to process:`);
  filesToProcess.forEach((f, i) => {
    console.log(`  ${i + 1}. ${path.relative(DOCS_BASE_PATH, f)}`);
  });
  console.log('');

  if (filesToProcess.length === 0) {
    console.error('❌ No markdown files found. Check the DOCS_BASE_PATH.');
    process.exit(1);
  }

  // ── Load raw documents ─────────────────────────────────────────────────────
  console.log('📄 Loading documents...');
  const rawDocs: Document[] = filesToProcess.map(loadDocument);
  console.log(`✅ Loaded ${rawDocs.length} documents\n`);

  // ── Split documents ────────────────────────────────────────────────────────
  console.log('✂️  Splitting documents into chunks...');
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', ' ', ''],
  });

  const chunks = await splitter.splitDocuments(rawDocs);
  console.log(`✅ Created ${chunks.length} chunks\n`);

  // ── Initialize OpenAI Embeddings ───────────────────────────────────────────
  console.log('🔢 Initializing OpenAI embeddings (text-embedding-3-small)...');
  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  // ── Initialize Pinecone ────────────────────────────────────────────────────
  console.log('🌲 Initializing Pinecone connection...');
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const indexName = process.env.PINECONE_INDEX || 'nextjs-docs';
  const index = pinecone.index(indexName);

  // ── Batch upsert in groups of 50 chunks (rate limit safety) ──────────────
  const BATCH_SIZE = 50;
  console.log(
    `\n📤 Upserting ${chunks.length} chunks to Pinecone index "${indexName}" in batches of ${BATCH_SIZE}...`
  );

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    console.log(`  ⬆️  Batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`);

    await PineconeStore.fromDocuments(batch, embeddings, {
      pineconeIndex: index,
    });

    // Rate limit delay between batches
    if (i + BATCH_SIZE < chunks.length) {
      console.log(`  ⏳ Waiting 2s to avoid rate limits...`);
      await delay(2000);
    }
  }

  console.log('\n✅ ===========================');
  console.log('✅ Ingestion complete!');
  console.log('✅ ===========================');
  console.log(`📊 Summary:`);
  console.log(`   • Files processed: ${filesToProcess.length}`);
  console.log(`   • Chunks created: ${chunks.length}`);
  console.log(`   • Pinecone index: ${indexName}`);
  console.log('');
}

main().catch((err) => {
  console.error('❌ Ingestion failed:', err);
  process.exit(1);
});
