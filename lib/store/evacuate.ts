// Moving every piece stored in one account to the others, so it can be removed
// or simply freed up. One file (or one split part) is in memory at a time.
import { IntegrityError } from "../errors";
import { formatBytes } from "../format";
import { sha256 } from "../hash";
import { locationsOf } from "../index-store";
import type { FileRecord, Location, Part } from "../index-types";
import { partName } from "../split";
import { adapterFor } from "../storage/adapter";
import { plan } from "../storage/placement";
import { accountStates, filesIn, refreshQuota } from "./accounts";
import { commit, fileById, inBulk, notify, plural, setRuntime, state, whileBusy } from "./core";
import { fetchStored } from "./transfers";

const driveName = (file: FileRecord) =>
  file.encrypted ? `nebula-${file.sha256.slice(0, 16)}.bin` : file.name;

const addUsed = (email: string, bytes: number) =>
  setRuntime(email, { used: (state.runtime[email]?.used ?? 0) + bytes });

// An account other than `avoid` with room for `bytes`, or null.
function roomFor(bytes: number, avoid: string[]) {
  const placement = plan(accountStates(), bytes, avoid, state.index.settings.routing);

  return placement.kind === "single" ? placement.id : null;
}

async function upload(account: string, name: string, blob: Blob, trashed: boolean) {
  const fileId = await adapterFor(account).upload(name, blob);

  addUsed(account, blob.size);

  if (trashed) await adapterFor(account).setTrashed(fileId, true);

  return { account, fileId };
}

async function moveOne(id: string, email: string) {
  const file = fileById(id);

  if (!file) return;

  const trashed = Boolean(file.trashedAt);
  const old: Location[] = [];
  let next: FileRecord = { ...file };

  // The main copy: re-upload it, or let the safe-mode copy take over.
  if (file.location?.account === email) {
    const others = (file.copies ?? []).filter((copy) => copy.account !== email);
    const target = roomFor(file.cipher?.size ?? file.size, [email, ...others.map((c) => c.account)]);

    if (target) {
      const blob = await fetchStored(file);

      next.location = await upload(target, driveName(file), blob, trashed);
    } else if (others.length > 0) {
      next.location = others[0];
      next.copies = others.slice(1);
    } else {
      throw new Error(`No other account has room for "${file.name}" (${formatBytes(file.size)}).`);
    }

    old.push(file.location);
  }

  // Safe-mode copies: re-create elsewhere if there is room, otherwise drop them.
  for (const copy of (file.copies ?? []).filter((c) => c.account === email)) {
    const avoid = [email, next.location!.account];
    const target = roomFor(file.cipher?.size ?? file.size, avoid);

    next.copies = (next.copies ?? []).filter((c) => c !== copy);

    if (target) {
      const blob = await fetchStored(file);

      next.copies = [...next.copies, await upload(target, driveName(file), blob, trashed)];
    } else {
      notify("info", `"${file.name}" lost its safe-mode copy: no other account has room for one.`);
    }

    old.push(copy);
  }

  // Split parts: each moves on its own, checked against its own hash.
  if (file.parts?.some((part) => part.account === email)) {
    const ordered = [...file.parts].sort((a, b) => a.offset - b.offset);
    const parts: Part[] = [];

    for (const [i, part] of ordered.entries()) {
      if (part.account !== email) {
        parts.push(part);

        continue;
      }

      const target = roomFor(part.bytes, [email]);

      if (!target) {
        throw new Error(`No other account has room for a ${formatBytes(part.bytes)} piece of "${file.name}".`);
      }

      const blob = await adapterFor(email).download(part.fileId);

      if ((await sha256(blob)) !== part.sha256) throw new IntegrityError(file.name);

      parts.push({ ...part, ...(await upload(target, partName(driveName(file), i + 1, ordered.length), blob, trashed)) });
      old.push(part);
    }

    next = { ...next, parts };
  }

  await commit({
    ...state.index,
    files: state.index.files.map((other) => (other.id === id ? next : other)),
  });

  // Only now that the new copies are recorded do the old ones go.
  for (const location of old) {
    await adapterFor(location.account).remove(location.fileId).catch(() => {});
  }
}

// Moves everything stored in `email` onto the other connected accounts.
export async function moveOffAccount(email: string) {
  if (!state.runtime[email]?.connected) {
    notify("error", `Reconnect ${email} first, so its files can be read.`);

    return;
  }

  const ids = filesIn(email).map((file) => file.id);

  await inBulk(`Moving files off ${email}`, ids, (id) => whileBusy(id, () => moveOne(id, email)));
  await refreshQuota();

  const left = filesIn(email).length;

  if (left === 0) {
    notify("success", `Every file is off ${email}. It can be removed now.`);
  } else {
    notify("error", `${plural(left, "file")} could not be moved off ${email}. See the messages above.`);
  }
}

// How many pieces live where, for showing before a move.
export const piecesIn = (email: string) =>
  filesIn(email).reduce(
    (sum, file) => sum + locationsOf(file).filter((l) => l.account === email).length,
    0,
  );
