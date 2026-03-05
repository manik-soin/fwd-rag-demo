import { describe, test, expect } from 'vitest';
import { getClaimById, getClaimsForTenant, getCustomerProfile } from '../../src/data/seed.js';

describe('Tenant Isolation', () => {
  describe('Claims', () => {
    test('customer-A only gets customer-A claims', () => {
      const claims = getClaimsForTenant('customer-A');
      expect(claims.length).toBeGreaterThan(0);
      claims.forEach((claim) => {
        expect(claim.tenantId).toBe('customer-A');
      });
    });

    test('customer-B only gets customer-B claims', () => {
      const claims = getClaimsForTenant('customer-B');
      expect(claims.length).toBeGreaterThan(0);
      claims.forEach((claim) => {
        expect(claim.tenantId).toBe('customer-B');
      });
    });

    test('customer-A cannot access customer-B claims by ID', () => {
      const claim = getClaimById('CLM-B-001', 'customer-A');
      expect(claim).toBeNull();
    });

    test('customer-B cannot access customer-A claims by ID', () => {
      const claim = getClaimById('CLM-A-001', 'customer-B');
      expect(claim).toBeNull();
    });

    test('valid claim ID with correct tenant returns claim', () => {
      const claim = getClaimById('CLM-A-001', 'customer-A');
      expect(claim).not.toBeNull();
      expect(claim!.id).toBe('CLM-A-001');
      expect(claim!.tenantId).toBe('customer-A');
    });

    test('non-existent claim ID returns null', () => {
      const claim = getClaimById('CLM-X-999', 'customer-A');
      expect(claim).toBeNull();
    });

    test('filters claims by status', () => {
      const pending = getClaimsForTenant('customer-A', 'pending');
      pending.forEach((claim) => {
        expect(claim.status).toBe('pending');
        expect(claim.tenantId).toBe('customer-A');
      });
    });
  });

  describe('Customer Profiles', () => {
    test('returns correct profile for customer-A', () => {
      const profile = getCustomerProfile('customer-A');
      expect(profile).not.toBeNull();
      expect(profile!.tenantId).toBe('customer-A');
      expect(profile!.name).toBe('Alice Chan');
    });

    test('returns correct profile for customer-B', () => {
      const profile = getCustomerProfile('customer-B');
      expect(profile).not.toBeNull();
      expect(profile!.tenantId).toBe('customer-B');
      expect(profile!.name).toBe('Bob Tan');
    });

    test('returns null for non-existent tenant', () => {
      const profile = getCustomerProfile('customer-X');
      expect(profile).toBeNull();
    });
  });

  describe('MCP Tool Tenant Scoping', () => {
    test('checkClaimStatus enforces tenant — cross-tenant returns null', () => {
      // customer-A trying to access customer-B's claim
      const result = getClaimById('CLM-B-001', 'customer-A');
      expect(result).toBeNull();
    });

    test('listClaims only returns tenant-scoped results', () => {
      const aClaims = getClaimsForTenant('customer-A');
      const bClaims = getClaimsForTenant('customer-B');

      const aIds = new Set(aClaims.map((c) => c.id));
      const bIds = new Set(bClaims.map((c) => c.id));

      // No overlap between tenant A and B claims
      for (const id of aIds) {
        expect(bIds.has(id)).toBe(false);
      }
    });
  });
});
