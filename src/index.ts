import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { getConfig } from './config.js';

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const config = getConfig();
app.listen(config.PORT, () => {
  console.log(`FWD RAG Demo running on port ${config.PORT}`);
});
