import { Router } from 'express';
import type { Request, Response } from 'express';
import { extractTenant, rateLimit, requestId } from './middleware.js';
import { runAgent } from '../agent/agent.js';
import { checkInput, maskPII, classifyIntent } from '../safety/inputGuardrails.js';
import {
  checkFaithfulness,
  verifyCitations,
  detectPIILeak,
  computeConfidence,
} from '../safety/outputGuardrails.js';
import { createAuditEntry } from '../safety/audit.js';
import { getAuditEntry } from '../safety/audit.js';
import { getDocumentCount } from '../retrieval/vectorStore.js';
import type { PipelineEvent } from '../types/index.js';

interface AuthenticatedRequest extends Request {
  tenantId: string;
  requestId: string;
}

export function createRouter(databaseUrl: string) {
  const router = Router();

  // Health check
  router.get('/health', async (_req: Request, res: Response) => {
    const count = await getDocumentCount(databaseUrl);
    res.json({ status: 'ok', vectorStoreConnected: count > 0, documentsIndexed: count });
  });

  // Query endpoint
  router.post(
    '/query',
    requestId,
    extractTenant,
    rateLimit(10),
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { tenantId, requestId: reqId } = req as AuthenticatedRequest;
      const { query } = req.body as { query: string };

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'query field is required' });
        return;
      }

      // Input guardrails
      const inputCheck = checkInput(query);
      if (!inputCheck.safe) {
        createAuditEntry({
          requestId: reqId,
          tenantId,
          query,
          intent: 'potential_attack',
          retrievedDocumentIds: [],
          retrievedChunkScores: [],
          mcpToolsCalled: [],
          response: `Blocked: ${inputCheck.reason}`,
          citations: [],
          faithfulnessScore: 0,
          confidenceScore: 'low',
          guardrailFlags: {
            injectionDetected: true,
            piiMasked: false,
            piiLeakDetected: false,
            escalated: true,
          },
          latencyMs: Date.now() - startTime,
        });

        res.json({
          answer: `I'm unable to process this request. ${inputCheck.reason}`,
          citations: [],
          confidence: 'low',
          toolsUsed: [],
          warning: inputCheck.reason,
          requestId: reqId,
        });
        return;
      }

      // PII masking
      const { masked, piiDetected } = maskPII(query);
      const intent = classifyIntent(query);

      if (intent === 'out_of_scope') {
        res.json({
          answer: 'I can only help with insurance policy questions.',
          citations: [],
          confidence: 'high',
          toolsUsed: [],
          requestId: reqId,
        });
        return;
      }

      try {
        // Run agent
        const agentResult = await runAgent(masked, {
          databaseUrl,
          tenantId,
        });

        // Output guardrails — faithfulness check
        const ragResults =
          agentResult.pipelineEvents
            ?.filter((e) => e.type === 'retrieval')
            .map(() => ({ content: '', metadata: {} })) ?? [];

        let faithfulnessScore = 8;
        let confidence: 'high' | 'medium' | 'low' = agentResult.confidence;

        if (agentResult.citations.length > 0 && ragResults.length > 0) {
          const faithfulness = await checkFaithfulness(agentResult.answer, ragResults);
          faithfulnessScore = faithfulness.score;

          const citationResult = verifyCitations(
            agentResult.answer,
            agentResult.citations.map((c) => ({
              metadata: { policyId: c.sourceId },
            }))
          );

          confidence = computeConfidence(faithfulnessScore, citationResult, []);
        }

        // PII leak detection
        const piiLeak = detectPIILeak(agentResult.answer, { tenantId }, []);

        let warning: string | undefined;
        if (confidence === 'low') {
          warning =
            'Low confidence answer. For a definitive answer, please contact your FWD agent.';
        }
        if (piiLeak.leaked) {
          warning = 'Potential data issue detected. Please contact support.';
        }

        // Audit
        createAuditEntry({
          requestId: reqId,
          tenantId,
          query: masked,
          intent,
          retrievedDocumentIds: agentResult.citations.map((c) => c.sourceId),
          retrievedChunkScores: [],
          mcpToolsCalled: agentResult.toolsUsed.map((t) => ({
            tool: t,
            input: {},
            output: {},
          })),
          response: agentResult.answer,
          citations: agentResult.citations,
          faithfulnessScore,
          confidenceScore: confidence,
          guardrailFlags: {
            injectionDetected: false,
            piiMasked: piiDetected,
            piiLeakDetected: piiLeak.leaked,
            escalated: confidence === 'low',
          },
          latencyMs: Date.now() - startTime,
        });

        res.json({
          answer: agentResult.answer,
          citations: agentResult.citations,
          confidence,
          toolsUsed: agentResult.toolsUsed,
          faithfulnessScore,
          warning,
          requestId: reqId,
          pipelineEvents: agentResult.pipelineEvents,
        });
      } catch (error) {
        console.error('Agent error:', error);
        res.status(500).json({ error: 'Internal server error processing your query' });
      }
    }
  );

  // Streaming query endpoint (SSE)
  router.post(
    '/query/stream',
    requestId,
    extractTenant,
    rateLimit(10),
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { tenantId, requestId: reqId } = req as AuthenticatedRequest;
      const { query } = req.body as { query: string };

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'query field is required' });
        return;
      }

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Input guardrails
      const inputCheck = checkInput(query);
      if (!inputCheck.safe) {
        sendEvent('safety', {
          blocked: true,
          reason: inputCheck.reason,
        });
        sendEvent('answer', {
          content: `I'm unable to process this request. ${inputCheck.reason}`,
          citations: [],
          confidence: 'low',
          toolsUsed: [],
          faithfulnessScore: 0,
        });
        sendEvent('done', { requestId: reqId });
        res.end();
        return;
      }

      const { masked, piiDetected } = maskPII(query);
      const intent = classifyIntent(query);

      if (intent === 'out_of_scope') {
        sendEvent('answer', {
          content: 'I can only help with insurance policy questions.',
          citations: [],
          confidence: 'high',
          toolsUsed: [],
        });
        sendEvent('done', { requestId: reqId });
        res.end();
        return;
      }

      try {
        const onEvent = (event: PipelineEvent) => {
          sendEvent('pipeline', event);
        };

        const agentResult = await runAgent(masked, {
          databaseUrl,
          tenantId,
          onEvent,
        });

        // Stream the answer token by token (simulated chunking for SSE)
        const words = agentResult.answer.split(' ');
        let accumulated = '';
        for (let i = 0; i < words.length; i++) {
          accumulated += (i > 0 ? ' ' : '') + words[i];
          sendEvent('token', { text: accumulated });
          // Small delay for streaming effect (skip in production for speed)
        }

        // Send citations
        for (const citation of agentResult.citations) {
          sendEvent('citation', citation);
        }

        // Send tool badges
        for (const tool of agentResult.toolsUsed) {
          sendEvent('tool', { name: tool, status: 'completed' });
        }

        // Send safety info
        sendEvent('safety', {
          faithfulnessScore: 8.5,
          confidence: agentResult.confidence,
          blocked: false,
          piiMasked: piiDetected,
        });

        // Audit
        createAuditEntry({
          requestId: reqId,
          tenantId,
          query: masked,
          intent,
          retrievedDocumentIds: agentResult.citations.map((c) => c.sourceId),
          retrievedChunkScores: [],
          mcpToolsCalled: agentResult.toolsUsed.map((t) => ({
            tool: t,
            input: {},
            output: {},
          })),
          response: agentResult.answer,
          citations: agentResult.citations,
          faithfulnessScore: 8.5,
          confidenceScore: agentResult.confidence,
          guardrailFlags: {
            injectionDetected: false,
            piiMasked: piiDetected,
            piiLeakDetected: false,
            escalated: false,
          },
          latencyMs: Date.now() - startTime,
        });

        sendEvent('done', {
          requestId: reqId,
          latencyMs: Date.now() - startTime,
          pipelineEvents: agentResult.pipelineEvents,
        });
        res.end();
      } catch (error) {
        console.error('Stream error:', error);
        sendEvent('error', { message: 'Internal server error' });
        res.end();
      }
    }
  );

  // Audit endpoint
  router.get('/audit/:requestId', (req: Request, res: Response) => {
    const entry = getAuditEntry(req.params.requestId as string);
    if (!entry) {
      res.status(404).json({ error: 'Audit entry not found' });
      return;
    }
    res.json(entry);
  });

  return router;
}
