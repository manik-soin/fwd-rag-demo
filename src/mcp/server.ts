import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getClaimById, getClaimsForTenant, getCustomerProfile } from '../data/seed.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'fwd-insurance',
    version: '1.0.0',
  });

  server.tool(
    'check_claim_status',
    'Look up the status and details of a specific insurance claim. Requires the claim ID and tenant ID. Returns claim details if the claim belongs to the tenant.',
    {
      claimId: z.string().describe('The claim ID to look up (e.g., CLM-A-001)'),
      tenantId: z.string().describe('The tenant ID of the requesting customer'),
    },
    async ({ claimId, tenantId }) => {
      const claim = getClaimById(claimId, tenantId);
      if (!claim) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Claim ${claimId} not found or not authorised for tenant ${tenantId}`,
              }),
            },
          ],
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(claim) }],
      };
    }
  );

  server.tool(
    'list_claims',
    'List all insurance claims for a customer. Can optionally filter by status (pending, approved, denied). Returns an array of claims belonging to the tenant.',
    {
      tenantId: z.string().describe('The tenant ID of the requesting customer'),
      status: z
        .enum(['pending', 'approved', 'denied'])
        .optional()
        .describe('Optional filter by claim status'),
    },
    async ({ tenantId, status }) => {
      const claims = getClaimsForTenant(tenantId, status);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(claims) }],
      };
    }
  );

  server.tool(
    'get_customer_profile',
    'Retrieve the customer profile including name, email, region, and list of active policies. Only returns data for the requesting tenant.',
    {
      tenantId: z.string().describe('The tenant ID of the requesting customer'),
    },
    async ({ tenantId }) => {
      const profile = getCustomerProfile(tenantId);
      if (!profile) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Customer profile not found for tenant ${tenantId}` }),
            },
          ],
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(profile) }],
      };
    }
  );

  return server;
}

// Direct function wrappers for agent use (bypass MCP transport)
export function checkClaimStatus(claimId: string, tenantId: string) {
  const claim = getClaimById(claimId, tenantId);
  if (!claim) {
    return { error: `Claim ${claimId} not found or not authorised for tenant ${tenantId}` };
  }
  return claim;
}

export function listClaims(tenantId: string, status?: string) {
  return getClaimsForTenant(tenantId, status);
}

export function getProfile(tenantId: string) {
  const profile = getCustomerProfile(tenantId);
  if (!profile) {
    return { error: `Customer profile not found for tenant ${tenantId}` };
  }
  return profile;
}
