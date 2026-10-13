import { DriveError, QuotaExceededError } from "./errors";

export const MAX_TRIES = 5;

const RATE_REASONS = ["rateLimitExceeded", "userRateLimitExceeded"];

// fetch() rejects with a TypeError when the network is unreachable.
export const isNetworkError = (error: unknown) => error instanceof TypeError;

export function isRetryable(error: unknown): boolean {
  if (isNetworkError(error)) {
    return true;
  }

  if (error instanceof QuotaExceededError || !(error instanceof DriveError)) {
    return false;
  }

  return (
    error.status === 429 ||
    (error.status >= 500 && error.status <= 504) ||
    (error.status === 403 && RATE_REASONS.includes(error.reason))
  );
}

// 1 s, 2 s, 4 s… unless Google told us how long to wait.
export function backoffMs(attempt: number, error?: unknown): number {
  if (error instanceof DriveError && error.retryAfterMs) {
    return error.retryAfterMs;
  }

  return 1000 * 2 ** (attempt - 1);
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function waitForOnline(): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("online", () => resolve(), { once: true });
  });
}

export type RetryOptions = {
  tries?: number;
  sleep?: (ms: number) => Promise<void>;
  online?: () => Promise<void>;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const tries = options.tries ?? MAX_TRIES;
  const wait = options.sleep ?? sleep;
  const online = options.online ?? waitForOnline;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= tries || !isRetryable(error)) {
        throw error;
      }

      if (isNetworkError(error)) {
        await online();
      }

      await wait(backoffMs(attempt, error));
    }
  }
}
