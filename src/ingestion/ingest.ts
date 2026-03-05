import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Document } from '@langchain/core/documents';
import { Pool } from 'pg';

interface PolicyFrontmatter {
  tenantId: string;
  policyId: string;
  policyType: string;
  effectiveDate: string;
  expiryDate: string;
  region: string;
}

function parseFrontmatter(content: string): { metadata: PolicyFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('No frontmatter found');

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      frontmatter[key.trim()] = rest.join(':').trim();
    }
  }

  return {
    metadata: frontmatter as unknown as PolicyFrontmatter,
    body: match[2],
  };
}

function getDocumentsDir(): string {
  // Support both source and compiled contexts
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const srcDocs = join(currentDir, '..', 'documents');
  return srcDocs;
}

export function loadDocuments(): Document[] {
  const docsDir = getDocumentsDir();
  const files = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
  const documents: Document[] = [];

  for (const file of files) {
    const content = readFileSync(join(docsDir, file), 'utf-8');
    const { metadata, body } = parseFrontmatter(content);
    documents.push(
      new Document({
        pageContent: body,
        metadata: { ...metadata, source: file },
      })
    );
  }

  return documents;
}

export async function chunkDocuments(documents: Document[]): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n## ', '\n### ', '\n- ', '\n\n', '\n'],
  });

  const chunks: Document[] = [];
  for (const doc of documents) {
    const docChunks = await splitter.splitDocuments([doc]);
    docChunks.forEach((chunk, index) => {
      chunk.metadata = { ...chunk.metadata, chunkIndex: index };
    });
    chunks.push(...docChunks);
  }

  return chunks;
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      embedding vector(1536)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS query_cache (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      query TEXT NOT NULL,
      query_embedding vector(1536) NOT NULL,
      response JSONB NOT NULL,
      pipeline_summary JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      ttl_seconds INTEGER DEFAULT 3600
    )
  `);
  // Index for semantic search on cache
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cache_tenant ON query_cache (tenant_id)
  `);
}

export async function createVectorStore(pool: Pool): Promise<PGVectorStore> {
  const embeddings = new OpenAIEmbeddings({
    modelName: 'text-embedding-3-small',
  });

  const config = {
    pool,
    tableName: 'policy_documents',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'embedding',
      contentColumnName: 'content',
      metadataColumnName: 'metadata',
    },
  };

  return new PGVectorStore(embeddings, config);
}

export async function ingestDocuments(databaseUrl: string): Promise<{ chunksIngested: number }> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureSchema(pool);

    // Check if documents already ingested
    const existing = await pool.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'policy_documents'"
    );
    if (existing.rows[0].count > 0) {
      const count = await pool.query('SELECT COUNT(*) FROM policy_documents');
      if (parseInt(count.rows[0].count) > 0) {
        console.log(`Documents already ingested (${count.rows[0].count} chunks). Skipping.`);
        return { chunksIngested: parseInt(count.rows[0].count) };
      }
    }

    const documents = loadDocuments();
    console.log(`Loaded ${documents.length} policy documents`);

    const chunks = await chunkDocuments(documents);
    console.log(`Created ${chunks.length} chunks`);

    const vectorStore = await createVectorStore(pool);
    await vectorStore.addDocuments(chunks);
    console.log(`Ingested ${chunks.length} chunks into pgvector`);

    // Create HNSW index for fast similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_docs_embedding
      ON policy_documents
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    // Create HNSW index on cache embeddings
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cache_embedding
      ON query_cache
      USING hnsw (query_embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    console.log('Created HNSW indexes');

    return { chunksIngested: chunks.length };
  } finally {
    await pool.end();
  }
}
