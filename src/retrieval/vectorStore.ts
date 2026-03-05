import { OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Document } from '@langchain/core/documents';
import { Pool } from 'pg';

let _pool: Pool | null = null;
let _vectorStore: PGVectorStore | null = null;

export function getPool(databaseUrl: string): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: databaseUrl });
  }
  return _pool;
}

export async function getVectorStore(databaseUrl: string): Promise<PGVectorStore> {
  if (!_vectorStore) {
    const pool = getPool(databaseUrl);
    const embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
    });

    _vectorStore = new PGVectorStore(embeddings, {
      pool,
      tableName: 'policy_documents',
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'embedding',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
    });
  }
  return _vectorStore;
}

export async function tenantScopedSearch(
  databaseUrl: string,
  query: string,
  tenantId: string,
  k: number = 10
): Promise<[Document, number][]> {
  if (!tenantId) {
    throw new Error('tenantId is required for all searches');
  }

  const vectorStore = await getVectorStore(databaseUrl);
  const results = await vectorStore.similaritySearchWithScore(query, k, {
    tenantId,
  });

  return results;
}

export async function getDocumentCount(databaseUrl: string): Promise<number> {
  const pool = getPool(databaseUrl);
  try {
    const result = await pool.query('SELECT COUNT(*) FROM policy_documents');
    return parseInt(result.rows[0].count);
  } catch {
    return 0;
  }
}
