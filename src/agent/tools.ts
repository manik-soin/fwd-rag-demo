import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { hybridSearch } from '../retrieval/hybridSearch.js';
import { rerank } from '../retrieval/reranker.js';
import { checkClaimStatus, listClaims, getProfile } from '../mcp/server.js';

export function createAgentTools(databaseUrl: string, tenantId: string) {
  const searchPolicyDocuments = tool(
    async ({ query }) => {
      const { documents } = await hybridSearch(databaseUrl, query, tenantId, 5);
      const { documents: reranked, scores } = await rerank(query, documents, 3);

      const results = reranked.map((doc, i) => ({
        content: doc.pageContent,
        policyId: doc.metadata.policyId,
        policyType: doc.metadata.policyType,
        section: doc.metadata.source,
        relevance: scores[i],
      }));

      return JSON.stringify(results);
    },
    {
      name: 'search_policy_documents',
      description:
        'Search insurance policy documents for information about coverage, exclusions, deductibles, claims process, premiums, and renewal terms. Returns relevant policy sections with citations.',
      schema: z.object({
        query: z.string().describe('The search query about policy details'),
      }),
    }
  );

  const checkClaim = tool(
    async ({ claimId }) => {
      const result = checkClaimStatus(claimId, tenantId);
      return JSON.stringify(result);
    },
    {
      name: 'check_claim_status',
      description:
        'Look up the status and details of a specific insurance claim by its claim ID. Returns claim status, amount, and description.',
      schema: z.object({
        claimId: z.string().describe('The claim ID (e.g., CLM-A-001)'),
      }),
    }
  );

  const listClaimsTool = tool(
    async ({ status }) => {
      const result = listClaims(tenantId, status);
      return JSON.stringify(result);
    },
    {
      name: 'list_claims',
      description:
        'List all insurance claims for the current customer. Can filter by status: pending, approved, or denied.',
      schema: z.object({
        status: z
          .enum(['pending', 'approved', 'denied'])
          .optional()
          .describe('Optional status filter'),
      }),
    }
  );

  const getCustomerProfile = tool(
    async () => {
      const result = getProfile(tenantId);
      return JSON.stringify(result);
    },
    {
      name: 'get_customer_profile',
      description:
        'Get the current customer profile including name, email, region, and list of active policies.',
      schema: z.object({}),
    }
  );

  return [searchPolicyDocuments, checkClaim, listClaimsTool, getCustomerProfile];
}
