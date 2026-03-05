import type { PipelineEvent } from '../types/index.js';

export class PipelineObserver {
  private events: PipelineEvent[] = [];
  private startTime: number;
  private emitFn: ((event: PipelineEvent) => void) | undefined;

  constructor(emit?: (event: PipelineEvent) => void) {
    this.startTime = Date.now();
    this.emitFn = emit;
  }

  step(event: Omit<PipelineEvent, 'ms'>): void {
    const withMs = { ...event, ms: Date.now() - this.startTime } as PipelineEvent;
    this.events.push(withMs);
    this.emitFn?.(withMs);
  }

  summary() {
    return {
      totalMs: Date.now() - this.startTime,
      steps: this.events.length,
      events: this.events,
    };
  }
}
