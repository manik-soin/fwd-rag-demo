import dotenv from 'dotenv';
dotenv.config();

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { getConfig } from './config.js';
import { createRouter } from './api/routes.js';
import { ingestDocuments } from './ingestion/ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = getConfig();
  const app = express();

  app.use(express.json());

  // Serve static frontend
  const publicDir = join(__dirname, 'public');
  app.use(express.static(publicDir));

  // Also try source public dir in dev mode
  if (config.NODE_ENV === 'development') {
    app.use(express.static(join(__dirname, '..', 'src', 'public')));
  }

  // API routes
  const apiRouter = createRouter(config.DATABASE_URL);
  app.use('/api', apiRouter);

  // Serve frontend for all non-API routes
  app.get('/', (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  // Auto-bootstrap: ingest documents on first start
  try {
    console.log('Checking database and ingesting documents if needed...');
    const result = await ingestDocuments(config.DATABASE_URL);
    console.log(`Database ready: ${result.chunksIngested} chunks available`);
  } catch (error) {
    console.error('Database initialization failed:', error);
    console.log('Server will start but RAG features may not work until DB is available.');
  }

  app.listen(config.PORT, () => {
    console.log(`FWD RAG Demo running on http://localhost:${config.PORT}`);
  });
}

main().catch(console.error);
