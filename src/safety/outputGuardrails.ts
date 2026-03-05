import { ChatOpenAI } from '@langchain/openai';
import type {
  FaithfulnessResult,
  CitationVerificationResult,
  PIILeakResult,
} from '../types/index.js';

export async function checkFaithfulness(
  answer: string,
  retrievedDocuments: { content: string; metadata: Record<string, unknown> }[]
): Promise<FaithfulnessResult> {
  if (retrievedDocuments.length === 0) {
    return { score: 0, unsupportedClaims: ['No documents retrieved to verify against'] };
  }

  const llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });

  const docsContext = retrievedDocuments
    .map((d, i) => `[Doc ${i + 1}] ${d.content}`)
    .join('\n\n');

  const response = await llm.invoke([
    {
      role: 'system',
      content: `You are a faithfulness evaluator. Given an answer and source documents, rate how well the answer is supported by the documents.

Return JSON only:
{
  "score": <number 0-10>,
  "unsupportedClaims": ["claim not in docs", ...]
}

Score 10 = fully supported, 0 = completely fabricated.`,
    },
    {
      role: 'user',
      content: `Answer: "${answer}"\n\nSource Documents:\n${docsContext}`,
    },
  ]);

  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { score: 5, unsupportedClaims: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 5,
      unsupportedClaims: Array.isArray(parsed.unsupportedClaims)
        ? parsed.unsupportedClaims
        : [],
    };
  } catch {
    return { score: 5, unsupportedClaims: [] };
  }
}

export function verifyCitations(
  answer: string,
  retrievedDocuments: { metadata: Record<string, unknown> }[]
): CitationVerificationResult {
  const citationRegex = /\[Policy\s+([A-Z]+-\d+)(?:,?\s*Section\s+\d+(?:\.\d+)?)?\]/gi;
  const foundCitations: string[] = [];
  const phantomCitations: string[] = [];
  const verifiedCitations: string[] = [];

  const availablePolicyIds = new Set(
    retrievedDocuments.map((d) => d.metadata.policyId as string)
  );

  let match;
  while ((match = citationRegex.exec(answer)) !== null) {
    const policyId = match[1];
    foundCitations.push(policyId);

    if (availablePolicyIds.has(policyId)) {
      verifiedCitations.push(policyId);
    } else {
      phantomCitations.push(policyId);
    }
  }

  return {
    valid: phantomCitations.length === 0,
    phantomCitations,
    verifiedCitations,
  };
}

export function detectPIILeak(
  response: string,
  requestContext: { tenantId: string },
  retrievedDocuments: { metadata: Record<string, unknown> }[]
): PIILeakResult {
  const details: string[] = [];

  // Check for other tenant's policy IDs in response
  const policyIdRegex = /\b([A-Z]+-\d+)\b/g;
  let match;
  while ((match = policyIdRegex.exec(response)) !== null) {
    const policyId = match[1];
    // Check if this policy belongs to a different tenant
    for (const doc of retrievedDocuments) {
      if (
        doc.metadata.policyId === policyId &&
        doc.metadata.tenantId !== requestContext.tenantId
      ) {
        details.push(`Cross-tenant data leak: policy ${policyId} belongs to another tenant`);
      }
    }
  }

  // Check for raw PII patterns in output
  const piiPatterns = [
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, label: 'credit card number' },
    { pattern: /\b[A-Z]{1,2}\d{6}[\dA]\b/, label: 'HKID number' },
  ];

  for (const { pattern, label } of piiPatterns) {
    if (pattern.test(response)) {
      details.push(`PII detected in output: ${label}`);
    }
  }

  return {
    leaked: details.length > 0,
    details,
  };
}

export function computeConfidence(
  faithfulnessScore: number,
  citationResult: CitationVerificationResult,
  retrievalScores: number[]
): 'high' | 'medium' | 'low' {
  const avgRetrieval =
    retrievalScores.length > 0
      ? retrievalScores.reduce((a, b) => a + b, 0) / retrievalScores.length
      : 0;

  if (
    faithfulnessScore >= 7 &&
    citationResult.valid &&
    citationResult.verifiedCitations.length > 0 &&
    avgRetrieval > 0.01
  ) {
    return 'high';
  }

  if (faithfulnessScore >= 4 && citationResult.phantomCitations.length === 0) {
    return 'medium';
  }

  return 'low';
}
