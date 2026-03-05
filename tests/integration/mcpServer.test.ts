import { describe, test, expect } from 'vitest';
import { checkClaimStatus, listClaims, getProfile } from '../../src/mcp/server.js';

describe('MCP Server Tools', () => {
  test('check_claim_status returns claim for valid tenant', () => {
    const result = checkClaimStatus('CLM-A-001', 'customer-A');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.id).toBe('CLM-A-001');
      expect(result.status).toBe('approved');
    }
  });

  test('check_claim_status rejects cross-tenant access', () => {
    const result = checkClaimStatus('CLM-B-001', 'customer-A');
    expect('error' in result).toBe(true);
  });

  test('check_claim_status returns error for non-existent claim', () => {
    const result = checkClaimStatus('CLM-X-999', 'customer-A');
    expect('error' in result).toBe(true);
  });

  test('list_claims returns only tenant claims', () => {
    const claims = listClaims('customer-A');
    expect(claims.length).toBe(3);
    claims.forEach((c) => {
      expect(c.tenantId).toBe('customer-A');
    });
  });

  test('list_claims filters by status', () => {
    const pending = listClaims('customer-A', 'pending');
    expect(pending.length).toBeGreaterThan(0);
    pending.forEach((c) => {
      expect(c.status).toBe('pending');
    });
  });

  test('get_customer_profile returns correct profile', () => {
    const profile = getProfile('customer-A');
    expect('error' in profile).toBe(false);
    if (!('error' in profile)) {
      expect(profile.name).toBe('Alice Chan');
      expect(profile.policies.length).toBe(2);
    }
  });

  test('get_customer_profile returns error for unknown tenant', () => {
    const profile = getProfile('customer-X');
    expect('error' in profile).toBe(true);
  });
});
