import type { GuardrailResult } from '../types/index.js';

const INJECTION_PATTERNS = [
  /ignore\s+(your|all|previous|prior)\s+(previous\s+)?(instructions|rules|constraints)/i,
  /ignore\s+everything\s+(above|before)/i,
  /you\s+are\s+now\s+(a|an)/i,
  /system\s*prompt/i,
  /reveal\s+(your|the)\s+(instructions|prompt|rules)/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\/?script>/i,
  /\{\{.*\}\}/,
  /pretend\s+(you|to\s+be)/i,
  /act\s+as\s+(if|a|an)/i,
  /do\s+not\s+follow/i,
  /override\s+(your|the|all)/i,
  /new\s+instructions/i,
  /forget\s+(your|all|previous|everything)/i,
  /disregard\s+(your|all|previous)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /developer\s+mode/i,
];

export function detectPromptInjection(input: string): GuardrailResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return {
        safe: false,
        reason: `Potential prompt injection detected: matches pattern ${pattern.source}`,
      };
    }
  }
  return { safe: true };
}

export function checkInputLength(input: string, maxLength: number = 2000): GuardrailResult {
  if (input.length > maxLength) {
    return {
      safe: false,
      reason: `Input exceeds maximum length of ${maxLength} characters (${input.length})`,
    };
  }
  return { safe: true };
}

const PII_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_CC]' },
  { pattern: /\b[A-Z]{1,2}\d{6}[\dA]\b/g, replacement: '[REDACTED_ID]' },
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  { pattern: /\b(?:\+?852[\s-]?)?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
];

export function maskPII(input: string): { masked: string; piiDetected: boolean } {
  let masked = input;
  let piiDetected = false;

  for (const { pattern, replacement } of PII_PATTERNS) {
    if (pattern.test(masked)) {
      piiDetected = true;
      masked = masked.replace(pattern, replacement);
    }
  }

  return { masked, piiDetected };
}

type Intent = 'policy_question' | 'claim_inquiry' | 'out_of_scope' | 'potential_attack';

const POLICY_KEYWORDS = [
  'policy', 'coverage', 'cover', 'covered', 'exclusion', 'excluded', 'deductible',
  'premium', 'insur', 'benefit', 'claim process', 'renewal', 'limit', 'protect',
];

const CLAIM_KEYWORDS = [
  'claim', 'status', 'pending', 'approved', 'denied', 'file a claim', 'my claim',
];

const OUT_OF_SCOPE_KEYWORDS = [
  'weather', 'joke', 'recipe', 'movie', 'sport', 'game', 'code', 'program',
  'stock', 'crypto', 'bitcoin', 'politics', 'news', 'script', 'python',
  'football', 'soccer', 'basketball',
];

export function classifyIntent(input: string): Intent {
  const lower = input.toLowerCase();

  // Check for injection first
  const injection = detectPromptInjection(input);
  if (!injection.safe) return 'potential_attack';

  // Check for claim-related queries
  if (CLAIM_KEYWORDS.some((k) => lower.includes(k))) return 'claim_inquiry';

  // Check for policy-related queries
  if (POLICY_KEYWORDS.some((k) => lower.includes(k))) return 'policy_question';

  // Check for out-of-scope
  if (OUT_OF_SCOPE_KEYWORDS.some((k) => lower.includes(k))) return 'out_of_scope';

  // Default to policy question for ambiguous queries (let the agent handle it)
  return 'policy_question';
}

export function checkInput(input: string, maxLength: number = 2000): GuardrailResult {
  // Length check
  const lengthResult = checkInputLength(input, maxLength);
  if (!lengthResult.safe) return lengthResult;

  // Injection detection
  const injectionResult = detectPromptInjection(input);
  if (!injectionResult.safe) return injectionResult;

  return { safe: true };
}
