import { describe, test, expect } from 'vitest';
import { loadDocuments, chunkDocuments } from '../../src/ingestion/ingest.js';

describe('RAG Pipeline', () => {
  test('loads all policy documents', () => {
    const docs = loadDocuments();
    expect(docs.length).toBe(4);
  });

  test('each document has required metadata', () => {
    const docs = loadDocuments();
    for (const doc of docs) {
      expect(doc.metadata.tenantId).toBeDefined();
      expect(doc.metadata.policyId).toBeDefined();
      expect(doc.metadata.policyType).toBeDefined();
      expect(doc.metadata.region).toBeDefined();
    }
  });

  test('chunks documents with clause-aware splitting', async () => {
    const docs = loadDocuments();
    const chunks = await chunkDocuments(docs);
    expect(chunks.length).toBeGreaterThan(docs.length);

    // Every chunk inherits tenant metadata
    for (const chunk of chunks) {
      expect(chunk.metadata.tenantId).toBeDefined();
      expect(chunk.metadata.policyId).toBeDefined();
      expect(typeof chunk.metadata.chunkIndex).toBe('number');
    }
  });

  test('chunks are within size limits', async () => {
    const docs = loadDocuments();
    const chunks = await chunkDocuments(docs);
    for (const chunk of chunks) {
      // Chunks should be roughly 1000 chars with some overlap tolerance
      expect(chunk.pageContent.length).toBeLessThan(1500);
    }
  });

  test('customer-A documents include HOME-001 and AUTO-001', () => {
    const docs = loadDocuments();
    const customerADocs = docs.filter((d) => d.metadata.tenantId === 'customer-A');
    const policyIds = customerADocs.map((d) => d.metadata.policyId);
    expect(policyIds).toContain('HOME-001');
    expect(policyIds).toContain('AUTO-001');
  });

  test('customer-B documents do not include customer-A policies', () => {
    const docs = loadDocuments();
    const customerBDocs = docs.filter((d) => d.metadata.tenantId === 'customer-B');
    const policyIds = customerBDocs.map((d) => d.metadata.policyId);
    expect(policyIds).not.toContain('HOME-001');
    expect(policyIds).not.toContain('AUTO-001');
  });
});
