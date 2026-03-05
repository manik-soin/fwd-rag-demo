import dotenv from 'dotenv';
dotenv.config();

import { ingestDocuments } from '../src/ingestion/ingest.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('Seeding database...');
  const result = await ingestDocuments(databaseUrl);
  console.log(`Done! ${result.chunksIngested} chunks in vector store.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
