import { createSHA256 } from "hash-wasm";

const PIECE = 8 * 1024 * 1024;

export type Hasher = {
  update(bytes: Uint8Array): void;
  digest(): string;
};

// For bytes that arrive in pieces, such as a download being streamed to disk.
export async function createHasher(): Promise<Hasher> {
  const hasher = await createSHA256();

  hasher.init();

  return {
    update: (bytes) => void hasher.update(bytes),
    digest: () => hasher.digest("hex"),
  };
}

// Hashes in 8 MB pieces so a large file never sits in memory at once.
export async function sha256(blob: Blob): Promise<string> {
  const hasher = await createHasher();

  for (let start = 0; start < blob.size; start += PIECE) {
    const piece = await blob.slice(start, start + PIECE).arrayBuffer();

    hasher.update(new Uint8Array(piece));
  }

  return hasher.digest();
}
