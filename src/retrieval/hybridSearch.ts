import { Document } from '@langchain/core/documents';
import { Pool } from 'pg';
import { tenantScopedSearch } from './vectorStore.js';
import { getPool } from './vectorStore.js';

interface RankedResult {
  document: Document;
  vectorRank: number | null;
  keywordRank: number | null;
  rrfScore: number;
}

async function keywordSearch(
  databaseUrl: string,
  query: string,
  tenantId: string,
  k: number = 10
): Promise<{ content: string; metadata: Record<string, unknown>; rank: number }[]> {
  const pool = getPool(databaseUrl);

  // Use PostgreSQL full-text search with tenant filtering
  const result = await pool.query(
    `SELECT content, metadata,
            ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
     FROM policy_documents
     WHERE metadata->>'tenantId' = $2
       AND to_tsvector('english', content) @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT $3`,
    [query, tenantId, k]
  );

  return result.rows.map((row) => ({
    content: row.content,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    rank: row.rank,
  }));
}

function reciprocalRankFusion(
  vectorResults: [Document, number][],
  keywordResults: { content: string; metadata: Record<string, unknown> }[],
  k: number = 60
): RankedResult[] {
  const scoreMap = new Map<string, RankedResult>();

  // Score vector results
  vectorResults.forEach(([doc, _score], index) => {
    const key = `${doc.metadata.policyId}-${doc.metadata.chunkIndex}`;
    const existing = scoreMap.get(key);
    const rrfContribution = 1 / (k + index + 1);

    if (existing) {
      existing.vectorRank = index + 1;
      existing.rrfScore += rrfContribution;
    } else {
      scoreMap.set(key, {
        document: doc,
        vectorRank: index + 1,
        keywordRank: null,
        rrfScore: rrfContribution,
      });
    }
  });

  // Score keyword results
  keywordResults.forEach((result, index) => {
    const key = `${result.metadata.policyId}-${result.metadata.chunkIndex}`;
    const existing = scoreMap.get(key);
    const rrfContribution = 1 / (k + index + 1);

    if (existing) {
      existing.keywordRank = index + 1;
      existing.rrfScore += rrfContribution;
    } else {
      scoreMap.set(key, {
        document: new Document({
          pageContent: result.content,
          metadata: result.metadata,
        }),
        vectorRank: null,
        keywordRank: index + 1,
        rrfScore: rrfContribution,
      });
    }
  });

  return Array.from(scoreMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

export async function hybridSearch(
  databaseUrl: string,
  query: string,
  tenantId: string,
  topK: number = 5
): Promise<{ documents: Document[]; scores: number[] }> {
  if (!tenantId) {
    throw new Error('tenantId is required for all searches');
  }

  // Run vector and keyword searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    tenantScopedSearch(databaseUrl, query, tenantId, 10),
    keywordSearch(databaseUrl, query, tenantId, 10),
  ]);

  // Fuse results with RRF
  const fused = reciprocalRankFusion(vectorResults, keywordResults);
  const topResults = fused.slice(0, topK);

  return {
    documents: topResults.map((r) => r.document),
    scores: topResults.map((r) => r.rrfScore),
  };
}
