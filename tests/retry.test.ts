import { describe, expect, it, vi } from "vitest";
import { AuthExpiredError, DriveError, QuotaExceededError } from "../lib/errors";
import { isRetryable, withRetry } from "../lib/retry";

const quiet = () => {
  const waits: number[] = [];

  return {
    waits,
    options: {
      sleep: async (ms: number) => void waits.push(ms),
      online: async () => {},
    },
  };
};

describe("isRetryable", () => {
  it("retries rate limits, server trouble and dropped connections", () => {
    expect(isRetryable(new DriveError(429, "", "slow down"))).toBe(true);
    expect(isRetryable(new DriveError(403, "rateLimitExceeded", ""))).toBe(true);
    expect(isRetryable(new DriveError(503, "", ""))).toBe(true);
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not retry a full account, an expired login or a bad request", () => {
    expect(isRetryable(new QuotaExceededError("a@gmail.com"))).toBe(false);
    expect(isRetryable(new AuthExpiredError("a@gmail.com"))).toBe(false);
    expect(isRetryable(new DriveError(404, "notFound", ""))).toBe(false);
    expect(isRetryable(new DriveError(403, "forbidden", ""))).toBe(false);
  });
});

describe("withRetry", () => {
  it("backs off 1 s, 2 s, 4 s and then succeeds", async () => {
    const { waits, options } = quiet();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new DriveError(500, "", ""))
      .mockRejectedValueOnce(new DriveError(502, "", ""))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue("ok");

    await expect(withRetry(fn, options)).resolves.toBe("ok");
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it("honours Retry-After", async () => {
    const { waits, options } = quiet();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new DriveError(429, "", "", 7000))
      .mockResolvedValue("ok");

    await withRetry(fn, options);
    expect(waits).toEqual([7000]);
  });

  it("gives up after 5 tries", async () => {
    const { options } = quiet();
    const fn = vi.fn().mockRejectedValue(new DriveError(503, "", "down"));

    await expect(withRetry(fn, options)).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("throws at once for errors that will not fix themselves", async () => {
    const { options } = quiet();
    const fn = vi.fn().mockRejectedValue(new AuthExpiredError("a@gmail.com"));

    await expect(withRetry(fn, options)).rejects.toBeInstanceOf(AuthExpiredError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
