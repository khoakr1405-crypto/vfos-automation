/**
 * Retry Policy — Intelligent retry logic and error classification.
 *
 * Provides granular policies to classify errors (transient vs. fatal)
 * and calculates delay intervals using exponential/fixed backoff with jitter
 * to avoid resource exhaustion and concurrent herd effects.
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  backoff: 'fixed' | 'exponential';
  jitterMs: number;
  retryableExitCodes: number[];
  retryableErrorPatterns: RegExp[];
  nonRetryableErrorPatterns: RegExp[];
}

export type ErrorClassification = 'retryable' | 'non_retryable' | 'unknown';

export const DEFAULT_RETRY_POLICY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoff: 'exponential',
  jitterMs: 100,
  retryableExitCodes: [
    429, // Rate limit / transient server busy
    503, // Service unavailable
    137, // SIGKILL (often transient memory spike or timeout force kill)
    143, // SIGTERM
    999, // Simulated retryable code for demo
  ],
  retryableErrorPatterns: [
    /timeout/i,
    /rate limit/i,
    /connection reset/i,
    /econnrefused/i,
    /temporary network error/i,
    /transient failure/i,
    /transient server error/i,
  ],
  nonRetryableErrorPatterns: [
    /missing file/i,
    /invalid config/i,
    /syntax error/i,
    /permission denied/i,
    /wrong cwd/i,
    /enoent/i,
    /eacces/i,
    /fatal error/i,
  ],
};

export class RetryPolicy {
  private readonly config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_POLICY, ...config };
  }

  /**
   * Classifies step command outcome or string errors as transient or fatal.
   */
  classify(exitCode: number | null, stderr: string): ErrorClassification {
    // 1. First, check non-retryable patterns
    for (const pattern of this.config.nonRetryableErrorPatterns) {
      if (pattern.test(stderr)) {
        return 'non_retryable';
      }
    }

    // 2. Next, check explicitly retryable error patterns
    for (const pattern of this.config.retryableErrorPatterns) {
      if (pattern.test(stderr)) {
        return 'retryable';
      }
    }

    // 3. Check exit codes
    if (exitCode !== null && this.config.retryableExitCodes.includes(exitCode)) {
      return 'retryable';
    }

    // 4. Default classification
    return 'unknown';
  }

  /**
   * Calculates backoff wait duration for current attempt (1-based index).
   */
  calculateDelay(attempt: number): number {
    if (attempt <= 1) return 0;

    let delay = this.config.baseDelayMs;

    if (this.config.backoff === 'exponential') {
      // attempt 2: delay * 2^0, attempt 3: delay * 2^1, etc.
      delay = this.config.baseDelayMs * Math.pow(2, attempt - 2);
    }

    // Add randomized jitter to prevent herd stampede
    const jitter = (Math.random() * 2 - 1) * this.config.jitterMs;
    return Math.max(0, Math.round(delay + jitter));
  }

  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }
}
