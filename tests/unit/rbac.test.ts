import { describe, test, expect } from 'vitest';
import { checkToolAccess, getAvailableTools } from '../../src/safety/rbac.js';

describe('RBAC - Tool Access Control', () => {
  test('customer role cannot access unregistered write tools', () => {
    const result = checkToolAccess('customer', 'approve_claim');
    expect(result.allowed).toBe(false);
  });

  test('customer role can access read tools', () => {
    const result = checkToolAccess('customer', 'check_claim_status');
    expect(result.allowed).toBe(true);
  });

  test('customer role can access list_claims', () => {
    const result = checkToolAccess('customer', 'list_claims');
    expect(result.allowed).toBe(true);
  });

  test('customer role can access get_customer_profile', () => {
    const result = checkToolAccess('customer', 'get_customer_profile');
    expect(result.allowed).toBe(true);
  });

  test('no write tools are exposed to customer role', () => {
    const tools = getAvailableTools('customer');
    const writeTools = tools.filter((t) => t.type === 'write');
    expect(writeTools).toHaveLength(0);
  });

  test('all available customer tools are read-only', () => {
    const tools = getAvailableTools('customer');
    expect(tools.length).toBeGreaterThan(0);
    tools.forEach((t) => {
      expect(t.type).toBe('read');
    });
  });

  test('unknown tool is rejected', () => {
    const result = checkToolAccess('customer', 'nonexistent_tool');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not registered');
  });
});
