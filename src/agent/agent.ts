import { ChatOpenAI } from '@langchain/openai';
import { SYSTEM_PROMPT } from './prompts.js';
import { hybridSearch } from '../retrieval/hybridSearch.js';
import { checkClaimStatus, listClaims, getProfile } from '../mcp/server.js';
import { classifyIntent } from '../safety/inputGuardrails.js';
import type { QueryResponse, Citation, PipelineEvent } from '../types/index.js';

export interface AgentOptions {
  databaseUrl: string;
  tenantId: string;
  onEvent?: (event: PipelineEvent) => void;
}

export async function runAgent(
  query: string,
  options: AgentOptions
): Promise<QueryResponse> {
  const startTime = Date.now();
  const events: PipelineEvent[] = [];

  function emit(event: Omit<PipelineEvent, 'ms'>) {
    const withMs = { ...event, ms: Date.now() - startTime } as PipelineEvent;
    events.push(withMs);
    options.onEvent?.(withMs);
  }

  const { databaseUrl, tenantId } = options;
  const toolsUsed: string[] = [];
  const toolResults: { tool: string; result: string }[] = [];

  // Step 1: Fast keyword-based routing (μs instead of 1.4s LLM call)
  const intent = classifyIntent(query);
  emit({ type: 'thinking', content: `Routed as: ${intent}` });

  if (intent === 'claim_inquiry') {
    // MCP tool path — check if query mentions a specific claim ID
    const claimIdMatch = query.match(/CLM-[A-Z]-\d+/i);

    if (claimIdMatch) {
      const toolName = 'check_claim_status';
      emit({ type: 'tool_call', tool: toolName, args: { claimId: claimIdMatch[0] } });
      toolsUsed.push(toolName);
      const result = checkClaimStatus(claimIdMatch[0], tenantId);
      toolResults.push({ tool: toolName, result: JSON.stringify(result) });
    } else {
      const toolName = 'list_claims';
      emit({ type: 'tool_call', tool: toolName, args: {} });
      toolsUsed.push(toolName);
      const result = listClaims(tenantId);
      toolResults.push({ tool: toolName, result: JSON.stringify(result) });
    }

    // Also fetch profile for context
    const profile = getProfile(tenantId);
    if (profile) {
      toolResults.push({ tool: 'get_customer_profile', result: JSON.stringify(profile) });
    }
  } else {
    // RAG path — hybrid search (no reranker LLM, use RRF scores directly)
    emit({ type: 'tool_call', tool: 'search_policy_documents', args: { query } });
    toolsUsed.push('search_policy_documents');

    const { documents, scores } = await hybridSearch(databaseUrl, query, tenantId, 3);
    emit({ type: 'retrieval', query, results: documents.length });

    const results = documents.map((doc, i) => ({
      content: doc.pageContent,
      policyId: doc.metadata.policyId,
      policyType: doc.metadata.policyType,
      section: doc.metadata.source,
      relevance: scores[i],
    }));

    toolResults.push({ tool: 'search_policy_documents', result: JSON.stringify(results) });
  }

  // Step 2: Generate answer (single LLM call)
  emit({ type: 'thinking', content: 'Generating grounded answer with citations...' });

  const contextBlock = toolResults
    .map((tr) => `[${tr.tool}]\n${tr.result}`)
    .join('\n\n');

  const generationLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
  });

  const generationResponse = await generationLlm.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: query },
    {
      role: 'assistant',
      content: `I found the following information:\n\n${contextBlock}`,
    },
    {
      role: 'user',
      content:
        'Based on the information above, provide a concise answer with specific citations in the format [Policy ID, Section X]. If the information does not support an answer, say you don\'t have enough information.',
    },
  ]);

  const answer =
    typeof generationResponse.content === 'string'
      ? generationResponse.content
      : '';

  const tokenUsage = generationResponse.usage_metadata;
  if (tokenUsage) {
    emit({
      type: 'generation',
      model: 'gpt-4o-mini',
      tokens: (tokenUsage.input_tokens ?? 0) + (tokenUsage.output_tokens ?? 0),
    });
  }

  // Step 3: Extract citations
  const citations = extractCitations(answer, toolResults);

  return {
    answer,
    citations,
    confidence: 'high',
    toolsUsed,
    pipelineEvents: events,
    requestId: crypto.randomUUID(),
  };
}

function extractCitations(
  answer: string,
  toolResults: { tool: string; result: string }[]
): Citation[] {
  const citations: Citation[] = [];
  const citationRegex = /\[Policy\s+([A-Z]+-\d+),?\s*Section\s+(\d+(?:\.\d+)?)\]/gi;

  let match;
  while ((match = citationRegex.exec(answer)) !== null) {
    const policyId = match[1];
    const section = match[2];

    let quote = '';
    for (const tr of toolResults) {
      if (tr.tool === 'search_policy_documents') {
        try {
          const results = JSON.parse(tr.result);
          const relevant = results.find(
            (r: { policyId: string }) => r.policyId === policyId
          );
          if (relevant) {
            quote = relevant.content.slice(0, 200);
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    citations.push({
      sourceId: policyId,
      clause: `Section ${section}`,
      quote,
      relevance: 1,
    });
  }

  return citations;
}
