import { z } from 'zod';

export const CheckClaimStatusInput = z.object({
  claimId: z.string().describe('The claim ID to look up (e.g., CLM-A-001)'),
  tenantId: z.string().describe('The tenant ID of the requesting customer'),
});

export const ListClaimsInput = z.object({
  tenantId: z.string().describe('The tenant ID of the requesting customer'),
  status: z
    .enum(['pending', 'approved', 'denied'])
    .optional()
    .describe('Optional filter by claim status'),
});

export const GetCustomerProfileInput = z.object({
  tenantId: z.string().describe('The tenant ID of the requesting customer'),
});

export type CheckClaimStatusArgs = z.infer<typeof CheckClaimStatusInput>;
export type ListClaimsArgs = z.infer<typeof ListClaimsInput>;
export type GetCustomerProfileArgs = z.infer<typeof GetCustomerProfileInput>;
