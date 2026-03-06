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

  app.listen(config.PORT, () => {
    console.log(`FWD RAG Demo running on http://localhost:${config.PORT}`);

    // Auto-bootstrap: ingest documents after server is listening
    ingestDocuments(config.DATABASE_URL)
      .then((result) => console.log(`Database ready: ${result.chunksIngested} chunks available`))
      .catch((error) => {
        console.error('Database initialization failed:', error);
        console.log('RAG features may not work until DB is available.');
      });
  });
}

main().catch(console.error);
