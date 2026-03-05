import { describe, test, expect } from 'vitest';
import { verifyCitations, detectPIILeak, computeConfidence } from '../../src/safety/outputGuardrails.js';

describe('Output Guardrails', () => {
  describe('Citation Verification', () => {
    test('verifies valid citation', () => {
      const result = verifyCitations(
        'As stated in [Policy HOME-001, Section 2.1], flood damage is excluded.',
        [{ metadata: { policyId: 'HOME-001' } }]
      );
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toContain('HOME-001');
      expect(result.phantomCitations).toHaveLength(0);
    });

    test('detects phantom citation', () => {
      const result = verifyCitations(
        'As stated in [Policy HOME-999, Section 5], this is covered.',
        [{ metadata: { policyId: 'HOME-001' } }]
      );
      expect(result.valid).toBe(false);
      expect(result.phantomCitations).toContain('HOME-999');
    });

    test('handles multiple citations', () => {
      const result = verifyCitations(
        '[Policy HOME-001, Section 1] covers fire. [Policy AUTO-001, Section 2] covers theft.',
        [
          { metadata: { policyId: 'HOME-001' } },
          { metadata: { policyId: 'AUTO-001' } },
        ]
      );
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toHaveLength(2);
    });

    test('handles no citations in response', () => {
      const result = verifyCitations(
        'I don\'t have enough information to answer that.',
        [{ metadata: { policyId: 'HOME-001' } }]
      );
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toHaveLength(0);
    });
  });

  describe('PII Leak Detection', () => {
    test('detects cross-tenant data in response', () => {
      const result = detectPIILeak(
        'Customer B has policy HOME-002 at 123 Oak Street',
        { tenantId: 'customer-A' },
        [{ metadata: { tenantId: 'customer-B', policyId: 'HOME-002' } }]
      );
      expect(result.leaked).toBe(true);
      expect(result.details.length).toBeGreaterThan(0);
    });

    test('allows same-tenant data', () => {
      const result = detectPIILeak(
        'Your policy HOME-001 covers fire damage',
        { tenantId: 'customer-A' },
        [{ metadata: { tenantId: 'customer-A', policyId: 'HOME-001' } }]
      );
      expect(result.leaked).toBe(false);
    });

    test('detects credit card number in output', () => {
      const result = detectPIILeak(
        'Your card number is 4111 1111 1111 1111',
        { tenantId: 'customer-A' },
        []
      );
      expect(result.leaked).toBe(true);
    });
  });

  describe('Confidence Scoring', () => {
    test('returns high confidence for good scores', () => {
      const result = computeConfidence(
        9,
        { valid: true, phantomCitations: [], verifiedCitations: ['HOME-001'] },
        [0.02, 0.03]
      );
      expect(result).toBe('high');
    });

    test('returns medium confidence for moderate scores', () => {
      const result = computeConfidence(
        5,
        { valid: true, phantomCitations: [], verifiedCitations: [] },
        [0.01]
      );
      expect(result).toBe('medium');
    });

    test('returns low confidence for poor scores', () => {
      const result = computeConfidence(
        2,
        { valid: false, phantomCitations: ['HOME-999'], verifiedCitations: [] },
        [0.001]
      );
      expect(result).toBe('low');
    });
  });
});
