import { describe, test, expect } from 'vitest';
import { CostTracker } from '../../src/observability/costTracker.js';

describe('Cost Tracker', () => {
  test('tracks single model usage', () => {
    const tracker = new CostTracker();
    tracker.record('gpt-4o-mini', 500, 100);
    const summary = tracker.summary();
    expect(summary.totalTokens).toBe(600);
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.breakdown).toHaveLength(1);
  });

  test('tracks multiple model usages', () => {
    const tracker = new CostTracker();
    tracker.record('gpt-4o-mini', 500, 100);
    tracker.record('gpt-5', 1000, 200);
    tracker.record('text-embedding-3-small', 50, 0);
    const summary = tracker.summary();
    expect(summary.totalTokens).toBe(1850);
    expect(summary.breakdown).toHaveLength(3);
  });

  test('gpt-5 costs more than gpt-4o-mini', () => {
    const miniTracker = new CostTracker();
    miniTracker.record('gpt-4o-mini', 1000, 500);

    const fullTracker = new CostTracker();
    fullTracker.record('gpt-5', 1000, 500);

    expect(fullTracker.summary().totalCost).toBeGreaterThan(
      miniTracker.summary().totalCost
    );
  });

  test('embedding model has zero output cost', () => {
    const tracker = new CostTracker();
    tracker.record('text-embedding-3-small', 100, 0);
    const summary = tracker.summary();
    // Cost should only be input cost
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.totalCost).toBeLessThan(0.001);
  });

  test('unknown model defaults to zero cost', () => {
    const tracker = new CostTracker();
    tracker.record('unknown-model', 1000, 1000);
    const summary = tracker.summary();
    expect(summary.totalCost).toBe(0);
    expect(summary.totalTokens).toBe(2000);
  });

  test('empty tracker returns zero', () => {
    const tracker = new CostTracker();
    const summary = tracker.summary();
    expect(summary.totalTokens).toBe(0);
    expect(summary.totalCost).toBe(0);
    expect(summary.breakdown).toHaveLength(0);
  });
});
