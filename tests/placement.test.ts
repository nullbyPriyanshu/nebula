import { describe, expect, it } from "vitest";
import { plan, usable, type AccountState } from "../lib/storage/placement";

const GB = 1024 ** 3;

const account = (
  id: string,
  priority: number,
  usedGb: number,
  extra: Partial<AccountState> = {},
): AccountState => ({
  id,
  total: 15 * GB,
  used: usedGb * GB,
  buffer: 2 * GB,
  priority,
  status: "connected",
  ...extra,
});

describe("usable", () => {
  it("keeps the buffer free", () => {
    expect(usable(account("a", 1, 3))).toBe(10 * GB);
  });

  it("never goes negative", () => {
    expect(usable(account("a", 1, 14.5))).toBe(0);
  });
});

describe("plan with priority routing", () => {
  it("fills the first account in priority order", () => {
    const accounts = [account("b", 2, 0), account("a", 1, 5)];

    expect(plan(accounts, GB)).toEqual({ kind: "single", id: "a" });
  });

  it("skips a nearly full account", () => {
    const accounts = [account("a", 1, 12.5), account("b", 2, 0)];

    expect(plan(accounts, GB)).toEqual({ kind: "single", id: "b" });
  });

  it("skips disconnected, excluded and unlimited accounts", () => {
    const accounts = [
      account("a", 1, 0, { status: "disconnected" }),
      account("b", 2, 0),
      account("c", 3, 0, { total: 0, used: 0 }),
      account("d", 4, 0),
    ];

    expect(plan(accounts, GB, ["b"])).toEqual({ kind: "single", id: "d" });
  });

  it("splits only when no single account fits, largest space first", () => {
    const accounts = [account("a", 1, 9), account("b", 2, 5)];

    expect(plan(accounts, 10 * GB)).toEqual({
      kind: "split",
      parts: [
        { id: "b", bytes: 8 * GB },
        { id: "a", bytes: 2 * GB },
      ],
    });
  });

  it("reports how much space is missing", () => {
    const accounts = [account("a", 1, 9), account("b", 2, 5)];

    expect(plan(accounts, 13 * GB)).toEqual({ kind: "nospace", shortBy: GB });
  });

  it("rejects a bad size", () => {
    expect(() => plan([], -1)).toThrow();
  });
});

describe("plan with least-used routing", () => {
  it("picks the account with the most usable space", () => {
    const accounts = [account("a", 1, 9), account("b", 2, 1), account("c", 3, 4)];

    expect(plan(accounts, GB, [], "least-used")).toEqual({ kind: "single", id: "b" });
  });

  it("falls back to priority on a tie", () => {
    const accounts = [account("b", 2, 1), account("a", 1, 1)];

    expect(plan(accounts, GB, [], "least-used")).toEqual({ kind: "single", id: "a" });
  });

  it("skips a nearly full account and shares the split logic", () => {
    const accounts = [account("a", 1, 12), account("b", 2, 5)];

    expect(plan(accounts, GB, [], "least-used")).toEqual({ kind: "single", id: "b" });
    expect(plan(accounts, 9 * GB, [], "least-used").kind).toBe("split");
  });
});
