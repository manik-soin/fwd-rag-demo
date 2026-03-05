import type { Claim, CustomerProfile } from '../types/index.js';

export const claims: Claim[] = [
  {
    id: 'CLM-A-001',
    tenantId: 'customer-A',
    policyId: 'HOME-001',
    status: 'approved',
    amount: 45000,
    description: 'Water damage from burst kitchen pipe. Repaired flooring and cabinets.',
    createdAt: '2025-06-15',
  },
  {
    id: 'CLM-A-002',
    tenantId: 'customer-A',
    policyId: 'AUTO-001',
    status: 'pending',
    amount: 12000,
    description: 'Minor rear-end collision in Causeway Bay. Bumper and tail light replacement.',
    createdAt: '2025-09-20',
  },
  {
    id: 'CLM-A-003',
    tenantId: 'customer-A',
    policyId: 'HOME-001',
    status: 'denied',
    amount: 200000,
    description: 'Flood damage to ground floor during typhoon season. Denied: flood is excluded under Section 2.1.',
    createdAt: '2025-08-10',
  },
  {
    id: 'CLM-B-001',
    tenantId: 'customer-B',
    policyId: 'HOME-002',
    status: 'approved',
    amount: 8500,
    description: 'Theft of laptop and camera equipment. Police report filed.',
    createdAt: '2025-05-22',
  },
  {
    id: 'CLM-B-002',
    tenantId: 'customer-B',
    policyId: 'HOME-002',
    status: 'pending',
    amount: 3200,
    description: 'Accidental water discharge from upstairs unit. Ceiling repair needed.',
    createdAt: '2025-10-01',
  },
  {
    id: 'CLM-B-003',
    tenantId: 'customer-B',
    policyId: 'HOME-002',
    status: 'denied',
    amount: 15000,
    description: 'Damage during kitchen renovation. Denied: renovation damage excluded under Section 2.6.',
    createdAt: '2025-07-18',
  },
  {
    id: 'CLM-C-001',
    tenantId: 'customer-C',
    policyId: 'LIFE-001',
    status: 'pending',
    amount: 0,
    description: 'Inquiry about conversion privilege to whole life policy.',
    createdAt: '2025-11-05',
  },
  {
    id: 'CLM-C-002',
    tenantId: 'customer-C',
    policyId: 'LIFE-001',
    status: 'approved',
    amount: 0,
    description: 'Beneficiary change request processed. Updated primary beneficiary.',
    createdAt: '2025-04-12',
  },
  {
    id: 'CLM-C-003',
    tenantId: 'customer-C',
    policyId: 'LIFE-001',
    status: 'denied',
    amount: 50000,
    description: 'Policy loan request. Denied: policy loans not available for term life (Section 7).',
    createdAt: '2025-09-30',
  },
];

export const customers: CustomerProfile[] = [
  {
    id: 'CUST-A',
    tenantId: 'customer-A',
    name: 'Alice Chan',
    email: 'alice.chan@example.com',
    region: 'HK',
    policies: [
      { policyId: 'HOME-001', type: 'home', status: 'active' },
      { policyId: 'AUTO-001', type: 'auto', status: 'active' },
    ],
  },
  {
    id: 'CUST-B',
    tenantId: 'customer-B',
    name: 'Bob Tan',
    email: 'bob.tan@example.com',
    region: 'SG',
    policies: [
      { policyId: 'HOME-002', type: 'home', status: 'active' },
    ],
  },
  {
    id: 'CUST-C',
    tenantId: 'customer-C',
    name: 'Charlie Wong',
    email: 'charlie.wong@example.com',
    region: 'HK',
    policies: [
      { policyId: 'LIFE-001', type: 'life', status: 'active' },
    ],
  },
];

export function getClaimsForTenant(tenantId: string, status?: string): Claim[] {
  return claims.filter(
    (c) => c.tenantId === tenantId && (!status || c.status === status)
  );
}

export function getClaimById(claimId: string, tenantId: string): Claim | null {
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) return null;
  if (claim.tenantId !== tenantId) return null;
  return claim;
}

export function getCustomerProfile(tenantId: string): CustomerProfile | null {
  return customers.find((c) => c.tenantId === tenantId) ?? null;
}
