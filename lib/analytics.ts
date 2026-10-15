import { FILE_KINDS, fileKind } from "./format";
import type { FileRecord } from "./index-types";

export type Bar = { label: string; value: number };

// Bytes Nebula stores in each account, counting split parts and safe copies.
export function spaceByAccount(files: FileRecord[]): Bar[] {
  const totals = new Map<string, number>();
  const add = (account: string, bytes: number) =>
    totals.set(account, (totals.get(account) ?? 0) + bytes);

  for (const file of files) {
    // Encrypted files take a little more than their plain size.
    const stored = file.cipher?.size ?? file.size;

    if (file.location) add(file.location.account, stored);
    for (const part of file.parts ?? []) add(part.account, part.bytes);
    for (const copy of file.copies ?? []) add(copy.account, stored);
  }

  return [...totals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function spaceByKind(files: FileRecord[]): Bar[] {
  return FILE_KINDS.map((kind) => ({
    label: kind,
    value: files
      .filter((file) => fileKind(file.type, file.name) === kind)
      .reduce((sum, file) => sum + file.size, 0),
  })).filter((bar) => bar.value > 0);
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

// Monday 00:00 local time of the week containing the given moment.
function weekStart(time: number): number {
  const day = new Date(time);

  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));

  return day.getTime();
}

// Number of uploads in each of the last `weeks` weeks, oldest first.
export function uploadsPerWeek(
  files: FileRecord[],
  now: number,
  weeks = 8,
): Bar[] {
  const current = weekStart(now);

  return Array.from({ length: weeks }, (_, i) => {
    // Noon avoids landing on the wrong day when clocks change.
    const start = weekStart(current - (weeks - 1 - i) * WEEK + WEEK / 2);

    return {
      label: new Date(start).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      value: files.filter(
        (file) => weekStart(new Date(file.uploadedAt).getTime()) === start,
      ).length,
    };
  });
}

// The biggest files, largest first.
export const largestFiles = (files: FileRecord[], count = 10): Bar[] =>
  [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, count)
    .map((file) => ({ label: file.name, value: file.size }));

// Total size of today's files that had been uploaded by the end of each of
// the last `months` months, oldest first.
export function growthByMonth(files: FileRecord[], now: number, months = 12): Bar[] {
  const today = new Date(now);

  return Array.from({ length: months }, (_, i) => {
    const end = new Date(today.getFullYear(), today.getMonth() - (months - 1 - i) + 1, 1);

    return {
      label: new Date(end.getTime() - 1).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      }),
      value: files
        .filter((file) => new Date(file.uploadedAt).getTime() < end.getTime())
        .reduce((sum, file) => sum + file.size, 0),
    };
  });
}
