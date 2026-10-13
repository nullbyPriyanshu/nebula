import { AuthExpiredError, DriveError, QuotaExceededError } from "../errors";
import {
  MAX_TRIES,
  backoffMs,
  isNetworkError,
  isRetryable,
  sleep,
  waitForOnline,
  withRetry,
} from "../retry";
import { forget, tokenFor } from "./auth";

export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

const FOLDER_NAME = "Nebula";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// 8 MB; resumable chunks must be a multiple of 256 KB.
const CHUNK = 8 * 1024 * 1024;

async function toError(response: Response, email: string): Promise<Error> {
  let reason = "";
  let message = `Google Drive error ${response.status}`;

  try {
    const body = await response.json();

    reason = body?.error?.errors?.[0]?.reason ?? "";
    message = body?.error?.message ?? message;
  } catch {
    // No JSON body; the status alone decides.
  }

  if (response.status === 401) {
    forget(email);

    return new AuthExpiredError(email);
  }

  if (response.status === 403 && reason === "storageQuotaExceeded") {
    return new QuotaExceededError(email);
  }

  const retryAfter = Number(response.headers.get("Retry-After"));

  return new DriveError(
    response.status,
    reason,
    message,
    retryAfter > 0 ? retryAfter * 1000 : undefined,
  );
}

// Every authenticated Drive call goes through here: token, errors, backoff.
export function gfetch(
  email: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${tokenFor(email)}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw await toError(response, email);
    }

    return response;
  });
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=UTF-8" };

const fileUrl = (fileId: string) =>
  `${DRIVE_API}/files/${encodeURIComponent(fileId)}`;

const isMissing = (error: unknown) =>
  error instanceof DriveError && error.status === 404;

// ---------------------------------------------------------------- folder

const folderIds = new Map<string, string>();

// The visible "Nebula" folder in My Drive that holds this account's files.
async function ensureFolder(email: string): Promise<string> {
  const cached = folderIds.get(email);

  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    q: `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id)",
  });

  const found = await gfetch(email, `${DRIVE_API}/files?${params}`);
  let id: string | undefined = (await found.json()).files?.[0]?.id;

  if (!id) {
    const created = await gfetch(email, `${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    });

    id = (await created.json()).id as string;
  }

  folderIds.set(email, id);

  return id;
}

// ---------------------------------------------------------------- upload

async function startSession(
  email: string,
  name: string,
  type: string,
): Promise<string> {
  const open = async () =>
    gfetch(email, `${UPLOAD_API}/files?uploadType=resumable`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name,
        mimeType: type || "application/octet-stream",
        parents: [await ensureFolder(email)],
      }),
    });

  let response: Response;

  try {
    response = await open();
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }

    // The Nebula folder was deleted in Drive: look it up again.
    folderIds.delete(email);
    response = await open();
  }

  const session = response.headers.get("Location");

  if (!session) {
    throw new Error("Google did not return an upload session.");
  }

  return session;
}

// "Range: bytes=0-N" lists the bytes Google has stored so far.
function confirmedOffset(response: Response, fallback: number): number {
  const match = /bytes=0-(\d+)/.exec(response.headers.get("Range") ?? "");

  return match ? Number(match[1]) + 1 : fallback;
}

class SessionLostError extends Error {}

async function runSession(
  email: string,
  session: string,
  blob: Blob,
  onProgress?: (sent: number) => void,
): Promise<string> {
  const total = blob.size;

  let offset = 0;
  let failures = 0;
  let resync = false;

  for (;;) {
    let response: Response;

    try {
      if (resync) {
        // Ask how many bytes arrived before the failure.
        response = await fetch(session, {
          method: "PUT",
          headers: { "Content-Range": `bytes */${total}` },
        });
      } else {
        const end = Math.min(offset + CHUNK, total);

        response = await fetch(session, {
          method: "PUT",
          headers: {
            "Content-Range":
              total === 0 ? "bytes */0" : `bytes ${offset}-${end - 1}/${total}`,
          },
          body: blob.slice(offset, end),
        });
      }
    } catch (error) {
      if (!isNetworkError(error) || ++failures >= MAX_TRIES) {
        throw error;
      }

      await waitForOnline();
      await sleep(backoffMs(failures));
      resync = true;

      continue;
    }

    if (response.status === 308) {
      offset = resync
        ? confirmedOffset(response, 0)
        : confirmedOffset(response, Math.min(offset + CHUNK, total));

      if (!resync) {
        failures = 0;
      }

      resync = false;
      onProgress?.(offset);

      continue;
    }

    if (response.ok) {
      onProgress?.(total);

      return (await response.json()).id;
    }

    if (response.status === 404 || response.status === 410) {
      throw new SessionLostError();
    }

    const error = await toError(response, email);

    if (!isRetryable(error) || ++failures >= MAX_TRIES) {
      throw error;
    }

    await sleep(backoffMs(failures, error));
    resync = true;
  }
}

// Resumable upload into the Nebula folder. Resolves with the new file id.
export async function uploadFile(
  email: string,
  name: string,
  blob: Blob,
  onProgress?: (sent: number) => void,
): Promise<string> {
  for (let restarts = 0; ; restarts++) {
    const session = await startSession(email, name, blob.type);

    try {
      return await runSession(email, session, blob, onProgress);
    } catch (error) {
      // An expired session cannot be resumed; start the file again once.
      if (!(error instanceof SessionLostError) || restarts >= 1) {
        throw error instanceof SessionLostError
          ? new Error("The upload session expired. Try again.")
          : error;
      }
    }
  }
}

// ---------------------------------------------------------------- files

export async function downloadFile(email: string, fileId: string): Promise<Blob> {
  const response = await gfetch(email, `${fileUrl(fileId)}?alt=media`);

  return response.blob();
}

// Moves a file into or out of the account's Drive trash.
export async function setTrashed(
  email: string,
  fileId: string,
  trashed: boolean,
): Promise<void> {
  await gfetch(email, fileUrl(fileId), {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ trashed }),
  });
}

// Permanent delete. A file that is already gone counts as deleted.
export async function deleteFile(email: string, fileId: string): Promise<void> {
  try {
    await gfetch(email, fileUrl(fileId), { method: "DELETE" });
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}
