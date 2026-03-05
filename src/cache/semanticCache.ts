import { OpenAIEmbeddings } from '@langchain/openai';
import { Pool } from 'pg';
import type { Citation } from '../types/index.js';

interface CachedResponse {
  text: string;
  citations: Citation[];
}

interface CacheHit {
  response: CachedResponse;
  pipelineSummary: unknown;
  similarity: number;
}

export async function checkCache(
  pool: Pool,
  embeddings: OpenAIEmbeddings,
  query: string,
  tenantId: string,
  threshold: number = 0.95
): Promise<CacheHit | null> {
  try {
    const queryVec = await embeddings.embedQuery(query);

    const result = await pool.query(
      `SELECT response, pipeline_summary,
              1 - (query_embedding <=> $1::vector) AS similarity
       FROM query_cache
       WHERE tenant_id = $2
         AND created_at > NOW() - (ttl_seconds * INTERVAL '1 second')
         AND 1 - (query_embedding <=> $1::vector) > $3
       ORDER BY similarity DESC
       LIMIT 1`,
      [JSON.stringify(queryVec), tenantId, threshold]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      response: typeof row.response === 'string' ? JSON.parse(row.response) : row.response,
      pipelineSummary: row.pipeline_summary,
      similarity: parseFloat(row.similarity),
    };
  } catch {
    // Cache miss on error — don't block the pipeline
    return null;
  }
}

export async function writeCache(
  pool: Pool,
  embeddings: OpenAIEmbeddings,
  entry: {
    query: string;
    tenantId: string;
    response: string;
    citations: Citation[];
    pipelineSummary: unknown;
    ttlSeconds?: number;
  }
): Promise<void> {
  try {
    const vec = await embeddings.embedQuery(entry.query);
    await pool.query(
      `INSERT INTO query_cache (tenant_id, query, query_embedding, response, pipeline_summary, ttl_seconds)
       VALUES ($1, $2, $3::vector, $4, $5, $6)`,
      [
        entry.tenantId,
        entry.query,
        JSON.stringify(vec),
        JSON.stringify({ text: entry.response, citations: entry.citations }),
        JSON.stringify(entry.pipelineSummary),
        entry.ttlSeconds ?? 3600,
      ]
    );
  } catch {
    // Silently fail — cache write failure shouldn't break the pipeline
  }
}
