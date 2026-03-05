import { ChatOpenAI } from '@langchain/openai';
import { createAgentTools } from './tools.js';
import { SYSTEM_PROMPT, ROUTING_PROMPT } from './prompts.js';
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
  const tools = createAgentTools(databaseUrl, tenantId);
  const toolsUsed: string[] = [];

  // Step 1: Agent decides which tools to call using gpt-4o-mini
  emit({ type: 'thinking', content: 'Analyzing query to determine tool routing...' });

  const routingLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
  }).bindTools(tools);

  const routingResponse = await routingLlm.invoke([
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${ROUTING_PROMPT}` },
    { role: 'user', content: query },
  ]);

  // Step 2: Execute tool calls
  const toolResults: { tool: string; result: string }[] = [];

  if (routingResponse.tool_calls && routingResponse.tool_calls.length > 0) {
    for (const toolCall of routingResponse.tool_calls) {
      const matchedTool = tools.find((t) => t.name === toolCall.name);
      if (matchedTool) {
        emit({ type: 'tool_call', tool: toolCall.name, args: toolCall.args });
        toolsUsed.push(toolCall.name);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (matchedTool as any).invoke(toolCall.args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        toolResults.push({ tool: toolCall.name, result: resultStr });

        if (toolCall.name === 'search_policy_documents') {
          try {
            const parsed = JSON.parse(resultStr);
            emit({ type: 'retrieval', query, results: Array.isArray(parsed) ? parsed.length : 0 });
          } catch {
            emit({ type: 'retrieval', query, results: 0 });
          }
        }
      }
    }
  } else {
    // No tool calls — the model wants to answer directly
    // Force a RAG search for any policy-related query
    emit({ type: 'tool_call', tool: 'search_policy_documents', args: { query } });
    toolsUsed.push('search_policy_documents');

    const ragTool = tools.find((t) => t.name === 'search_policy_documents')!;
    const result = await ragTool.invoke({ query });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    toolResults.push({ tool: 'search_policy_documents', result: resultStr });

    try {
      const parsed = JSON.parse(resultStr);
      emit({ type: 'retrieval', query, results: Array.isArray(parsed) ? parsed.length : 0 });
    } catch {
      emit({ type: 'retrieval', query, results: 0 });
    }
  }

  // Step 3: Generate final answer with gpt-5 using tool results as context
  emit({ type: 'thinking', content: 'Generating grounded answer with citations...' });

  const contextBlock = toolResults
    .map((tr) => `[${tr.tool}]\n${tr.result}`)
    .join('\n\n');

  const generationLlm = new ChatOpenAI({
    model: 'gpt-5',
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
      model: 'gpt-5',
      tokens: (tokenUsage.input_tokens ?? 0) + (tokenUsage.output_tokens ?? 0),
    });
  }

  // Step 4: Extract citations from the answer
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

    // Try to find the quoted text in tool results
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
