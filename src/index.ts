import dotenv from 'dotenv';
dotenv.config();

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { getConfig } from './config.js';
import { createRouter } from './api/routes.js';
import { ingestDocuments } from './ingestion/ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = parseInt(process.env.PORT || '3000');

app.use(express.json());

// Health check — no dependencies, always responds immediately
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve static frontend
const publicDir = join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

// Start listening immediately so healthcheck passes
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);

  // Set up full application after server is live
  try {
    const config = getConfig();

    if (config.NODE_ENV === 'development') {
      app.use(express.static(join(__dirname, '..', 'src', 'public')));
    }

    const apiRouter = createRouter(config.DATABASE_URL);
    app.use('/api', apiRouter);

    ingestDocuments(config.DATABASE_URL)
      .then((result) => console.log(`Database ready: ${result.chunksIngested} chunks available`))
      .catch((error) => {
        console.error('Database initialization failed:', error);
      });
  } catch (error) {
    console.error('Configuration error — API routes not available:', error);
  }
});
