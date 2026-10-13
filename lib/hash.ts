import { createSHA256 } from "hash-wasm";

const PIECE = 8 * 1024 * 1024;

// Hashes in 8 MB pieces so a large file never sits in memory at once.
export async function sha256(blob: Blob): Promise<string> {
  const hasher = await createSHA256();

  hasher.init();

  for (let start = 0; start < blob.size; start += PIECE) {
    const piece = await blob.slice(start, start + PIECE).arrayBuffer();

    hasher.update(new Uint8Array(piece));
  }

  return hasher.digest("hex");
}
