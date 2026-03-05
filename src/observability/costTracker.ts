interface TokenUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10.0 / 1_000_000 },
  'text-embedding-3-small': { input: 0.02 / 1_000_000, output: 0 },
};

export class CostTracker {
  private usages: TokenUsage[] = [];

  record(model: string, promptTokens: number, completionTokens: number): void {
    const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
    const cost = promptTokens * pricing.input + completionTokens * pricing.output;
    this.usages.push({
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
    });
  }

  summary() {
    return {
      totalTokens: this.usages.reduce((s, u) => s + u.totalTokens, 0),
      totalCost: this.usages.reduce((s, u) => s + u.cost, 0),
      breakdown: this.usages,
    };
  }
}
