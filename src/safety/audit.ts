import type { AuditEntry, Citation } from '../types/index.js';

const auditLog: AuditEntry[] = [];

export function logAuditEntry(entry: AuditEntry): void {
  auditLog.push(entry);
  // In production, this would write to stdout as JSON lines for CloudWatch/Datadog
  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify(entry));
  }
}

export function getAuditEntry(requestId: string): AuditEntry | undefined {
  return auditLog.find((e) => e.requestId === requestId);
}

export function getRecentAuditEntries(limit: number = 10): AuditEntry[] {
  return auditLog.slice(-limit);
}

export function createAuditEntry(params: {
  requestId: string;
  tenantId: string;
  query: string;
  intent: string;
  retrievedDocumentIds: string[];
  retrievedChunkScores: number[];
  mcpToolsCalled: { tool: string; input: unknown; output: unknown }[];
  response: string;
  citations: Citation[];
  faithfulnessScore: number;
  confidenceScore: string;
  guardrailFlags: {
    injectionDetected: boolean;
    piiMasked: boolean;
    piiLeakDetected: boolean;
    escalated: boolean;
  };
  latencyMs: number;
}): AuditEntry {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...params,
  };

  logAuditEntry(entry);
  return entry;
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}
