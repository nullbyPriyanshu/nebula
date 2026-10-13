import type { Routing } from "../index-types";

export type AccountState = {
  id: string;
  total: number;
  used: number;
  buffer: number;
  priority: number;
  status: "connected" | "disconnected";
};

export const DEFAULT_BUFFER = 2 * 1024 ** 3;

export const usable = (a: AccountState) =>
  Math.max(0, a.total - a.used - a.buffer);

export type PlacementPlan =
  | {
      kind: "single";
      id: string;
    }
  | {
      kind: "split";
      parts: {
        id: string;
        bytes: number;
      }[];
    }
  | {
      kind: "nospace";
      shortBy: number;
    };

export function plan(
  accounts: AccountState[],
  size: number,
  exclude: string[] = [],
  routing: Routing = "priority",
): PlacementPlan {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("File size must be a non-negative safe integer");
  }

  // total 0 means the limit is unknown or unlimited: never auto-place there.
  const ready = accounts
    .filter(
      (a) => a.status === "connected" && a.total > 0 && !exclude.includes(a.id),
    )
    .sort((a, b) =>
      routing === "least-used"
        ? usable(b) - usable(a) || a.priority - b.priority
        : a.priority - b.priority,
    );

  // First, try to find one account that can hold the entire file.
  const one = ready.find((a) => usable(a) >= size);

  if (one) {
    return {
      kind: "single",
      id: one.id,
    };
  }

  // Calculate the total usable space across eligible accounts.
  const free = ready.reduce((sum, account) => sum + usable(account), 0);

  if (free < size) {
    return {
      kind: "nospace",
      shortBy: size - free,
    };
  }

  // No single account fits, so divide the file across accounts.
  const parts: {
    id: string;
    bytes: number;
  }[] = [];

  let left = size;

  const sortedBySpace = [...ready].sort((a, b) => usable(b) - usable(a));

  for (const account of sortedBySpace) {
    const take = Math.min(usable(account), left);

    if (take > 0) {
      parts.push({
        id: account.id,
        bytes: take,
      });

      left -= take;
    }

    if (left <= 0) {
      break;
    }
  }

  return {
    kind: "split",
    parts,
  };
}
