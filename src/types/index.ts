export interface PolicyMetadata {
  tenantId: string;
  policyId: string;
  policyType: 'home' | 'auto' | 'life';
  effectiveDate: string;
  expiryDate: string;
  region: string;
  chunkIndex?: number;
}

export interface Citation {
  sourceId: string;
  clause: string;
  quote: string;
  relevance: number;
}

export interface Claim {
  id: string;
  tenantId: string;
  policyId: string;
  status: 'pending' | 'approved' | 'denied';
  amount: number;
  description: string;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  region: string;
  policies: { policyId: string; type: string; status: string }[];
}

export interface QueryRequest {
  query: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low';
  toolsUsed: string[];
  warning?: string;
  faithfulnessScore?: number;
  costUsd?: number;
  totalTokens?: number;
  cached?: boolean;
  pipelineEvents?: PipelineEvent[];
  requestId?: string;
}

export interface AuditEntry {
  timestamp: string;
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
}

export interface PipelineEvent {
  type: 'thinking' | 'tool_call' | 'retrieval' | 'rerank' | 'cache_hit' | 'generation' | 'guardrail' | 'answer';
  ms: number;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  query?: string;
  results?: number;
  before?: number;
  after?: number;
  similarity?: number;
  model?: string;
  tokens?: number;
  check?: string;
  passed?: boolean;
  citations?: Citation[];
  cost?: number;
}

export interface GuardrailResult {
  safe: boolean;
  reason?: string;
}

export interface FaithfulnessResult {
  score: number;
  unsupportedClaims: string[];
}

export interface CitationVerificationResult {
  valid: boolean;
  phantomCitations: string[];
  verifiedCitations: string[];
}

export interface PIILeakResult {
  leaked: boolean;
  details: string[];
}
