import { ChatOpenAI } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { z } from 'zod';

const RelevanceSchema = z.object({
  scores: z.array(
    z.object({
      index: z.number(),
      relevance: z.number().min(0).max(10),
    })
  ),
});

export async function rerank(
  query: string,
  documents: Document[],
  topK: number = 3
): Promise<{ documents: Document[]; scores: number[] }> {
  if (documents.length === 0) {
    return { documents: [], scores: [] };
  }

  if (documents.length <= topK) {
    return {
      documents,
      scores: documents.map(() => 10),
    };
  }

  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
  });

  const passageList = documents
    .map((doc, i) => `[${i}] ${doc.pageContent.slice(0, 500)}`)
    .join('\n\n');

  const response = await llm.invoke([
    {
      role: 'system',
      content: `You are a relevance judge. Rate each passage's relevance to the query on a scale of 0-10.
Return JSON: {"scores": [{"index": 0, "relevance": 8}, ...]}
Only return the JSON, nothing else.`,
    },
    {
      role: 'user',
      content: `Query: "${query}"\n\nPassages:\n${passageList}`,
    },
  ]);

  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = RelevanceSchema.parse(JSON.parse(jsonMatch[0]));
    const scored = parsed.scores
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, topK);

    return {
      documents: scored.map((s) => documents[s.index]),
      scores: scored.map((s) => s.relevance),
    };
  } catch {
    // Fallback: return first topK documents
    return {
      documents: documents.slice(0, topK),
      scores: documents.slice(0, topK).map(() => 5),
    };
  }
}
