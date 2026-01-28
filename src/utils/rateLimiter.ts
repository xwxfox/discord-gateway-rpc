import { type RateLimited } from '@/gateway/types';

interface RateLimitEntry {
  timestamp: number;
  retryAfter: number;
}

export class RateLimiter {
  private rateLimits: Map<number, RateLimitEntry[]> = new Map();
  private pendingRetries: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private maxHistorySize = 100;

  private isRateLimited(op: number): boolean {
    const now = Date.now();
    const entries = this.rateLimits.get(op);

    if (!entries || entries.length === 0) {
      return false;
    }

    const latestEntry = entries[entries.length - 1];
    if (!latestEntry) return false;

    return latestEntry.timestamp + latestEntry.retryAfter * 1000 > now;
  }

  private getWaitTimeFromEntries(op: number): number {
    const entries = this.rateLimits.get(op);

    if (!entries || entries.length === 0) {
      return 0;
    }

    const latestEntry = entries[entries.length - 1];
    if (!latestEntry) return 0;

    const waitTime = latestEntry.timestamp + latestEntry.retryAfter * 1000 - Date.now();
    return Math.max(0, waitTime);
  }

  trackRateLimit(op: number, data: RateLimited): void {
    const entries = this.rateLimits.get(op) ?? [];
    entries.push({
      timestamp: Date.now(),
      retryAfter: data.retry_after
    });

    if (entries.length > this.maxHistorySize) {
      entries.shift();
    }

    this.rateLimits.set(op, entries);
  }

  canProceed(op: number): boolean {
    return !this.isRateLimited(op);
  }

  getWaitTime(op: number): number {
    return this.getWaitTimeFromEntries(op);
  }

  async waitForAvailability(op: number): Promise<void> {
    const waitTime = this.getWaitTimeFromEntries(op);

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  clear(op?: number): void {
    if (op === undefined) {
      this.rateLimits.clear();
      this.pendingRetries.forEach(timer => clearTimeout(timer));
      this.pendingRetries.clear();
    } else {
      this.rateLimits.delete(op);
      const timer = this.pendingRetries.get(op);
      if (timer) {
        clearTimeout(timer);
        this.pendingRetries.delete(op);
      }
    }
  }

  getRateLimitStatus(op: number): {
    isRateLimited: boolean;
    waitTime: number;
    entryCount: number;
  } {
    const entries = this.rateLimits.get(op) ?? [];
    return {
      isRateLimited: this.isRateLimited(op),
      waitTime: this.getWaitTimeFromEntries(op),
      entryCount: entries.length
    };
  }
}
