import { normalizeIndex } from "../index-store";
import type { IndexFile } from "../index-types";
import { DRIVE_API, UPLOAD_API, gfetch } from "./drive";

const INDEX_FILENAME = "nebula-index.json";

const indexIds = new Map<string, string>();

// Find the existing index in an account's appDataFolder.
async function findIndexFile(email: string): Promise<string | null> {
  const cached = indexIds.get(email);

  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${INDEX_FILENAME}' and trashed = false`,
    fields: "files(id)",
    orderBy: "modifiedTime desc",
  });

  const response = await gfetch(email, `${DRIVE_API}/files?${params}`);
  const id: string | undefined = (await response.json()).files?.[0]?.id;

  if (id) {
    indexIds.set(email, id);
  }

  return id ?? null;
}

// Create an empty index file in appDataFolder.
async function createIndexFile(email: string): Promise<string> {
  const response = await gfetch(email, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: INDEX_FILENAME,
      mimeType: "application/json",
      parents: ["appDataFolder"],
    }),
  });

  const id: string = (await response.json()).id;

  indexIds.set(email, id);

  return id;
}

// Read the account's copy of the index. Null when it has none yet.
export async function readCloudIndex(email: string): Promise<IndexFile | null> {
  const fileId = await findIndexFile(email);

  if (!fileId) {
    return null;
  }

  const response = await gfetch(
    email,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
  );

  const text = await response.text();

  // Created but never written.
  if (!text.trim()) {
    return null;
  }

  let index: IndexFile | null = null;

  try {
    index = normalizeIndex(JSON.parse(text));
  } catch {
    // Falls through to the error below.
  }

  if (!index) {
    throw new Error(`The Nebula index stored in ${email} is invalid.`);
  }

  return index;
}

// Write the index to the account, creating the file on first use. Resolves
// with Drive's version number for the file after the write.
export async function writeCloudIndex(
  email: string,
  index: IndexFile,
): Promise<string | null> {
  const fileId = (await findIndexFile(email)) ?? (await createIndexFile(email));

  const response = await gfetch(
    email,
    `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=version`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(index),
    },
  );

  return (await response.json().catch(() => ({}))).version ?? null;
}

// Drive's version number for the index file: it changes on every write, so an
// unchanged number means the index need not be downloaded again. Null when the
// account has no index yet.
export async function cloudIndexVersion(email: string): Promise<string | null> {
  const fileId = await findIndexFile(email);

  if (!fileId) return null;

  const response = await gfetch(
    email,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=version`,
  );

  return (await response.json()).version ?? null;
}
