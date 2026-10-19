import { createHasher } from "./hash";
import type { Cipher, Encryption } from "./index-types";

// Files are encrypted in chunks with AES-256-GCM, so a large file never has to
// sit in memory whole. Chunk i uses IV = nonce (8 bytes) || i (4 bytes).
export const CHUNK = 8 * 1024 * 1024;
const TAG = 16;
const ITERATIONS = 600_000;

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase is not right.");
    this.name = "WrongPassphraseError";
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Wraps the file key with the passphrase; changing the passphrase only rewraps.
export async function wrapKey(key: CryptoKey, passphrase: string): Promise<Encryption> {
  const salt = random(16);
  const iv = random(12);
  const wrapping = await passphraseKey(passphrase, salt, ITERATIONS);
  const raw = await crypto.subtle.exportKey("raw", key);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapping, raw);

  return {
    salt: toBase64(salt),
    iterations: ITERATIONS,
    iv: toBase64(iv),
    wrappedKey: toBase64(new Uint8Array(wrapped)),
  };
}

// A new random file key, already wrapped with the passphrase.
export async function createVault(passphrase: string) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  return { key, encryption: await wrapKey(key, passphrase) };
}

export async function unlockVault(encryption: Encryption, passphrase: string) {
  const wrapping = await passphraseKey(
    passphrase,
    fromBase64(encryption.salt),
    encryption.iterations,
  );

  let raw: ArrayBuffer;

  try {
    raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encryption.iv) as BufferSource },
      wrapping,
      fromBase64(encryption.wrappedKey) as BufferSource,
    );
  } catch {
    throw new WrongPassphraseError();
  }

  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

const chunks = (size: number, chunk: number) => Math.max(1, Math.ceil(size / chunk));

export const cipherSize = (size: number, chunk = CHUNK) => size + TAG * chunks(size, chunk);

function chunkIv(nonce: Uint8Array, i: number) {
  const iv = new Uint8Array(12);

  iv.set(nonce);
  new DataView(iv.buffer).setUint32(8, i);

  return iv;
}

// Temporary files for encrypted uploads start with this, so leftovers from a
// crash can be found and removed.
const TEMP_PREFIX = "nebula-upload-";

type Sink = {
  write(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  // The finished bytes, and how to delete them once uploaded.
  finish(): Promise<{ blob: Blob; discard: () => Promise<void> }>;
  abort(): Promise<void>;
};

// Encrypted bytes go to a temporary file in the browser's private storage
// (OPFS) when it has one, so a large file never sits in memory whole.
async function diskSink(): Promise<Sink | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;

    const root = await navigator.storage.getDirectory();
    const name = `${TEMP_PREFIX}${crypto.randomUUID()}`;
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    const remove = () => root.removeEntry(name).catch(() => {});

    return {
      write: (bytes) => writable.write(bytes),
      finish: async () => {
        await writable.close();

        return { blob: await handle.getFile(), discard: remove };
      },
      abort: async () => {
        await writable.abort().catch(() => {});
        await remove();
      },
    };
  } catch {
    // No private storage (or no space): fall back to memory.
    return null;
  }
}

function memorySink(): Sink {
  const parts: Uint8Array<ArrayBuffer>[] = [];

  return {
    write: async (bytes) => void parts.push(bytes),
    finish: async () => ({
      blob: new Blob(parts, { type: "application/octet-stream" }),
      discard: async () => void parts.splice(0),
    }),
    abort: async () => void parts.splice(0),
  };
}

// Deletes temporary upload files left behind by a closed tab or a crash.
export async function clearUploadTemp() {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return;

    const root = await navigator.storage.getDirectory();

    for await (const name of root.keys()) {
      if (name.startsWith(TEMP_PREFIX)) await root.removeEntry(name).catch(() => {});
    }
  } catch {
    // Nothing to clean, or no access.
  }
}

// Encrypts chunk by chunk into a temporary file (or memory), so even a large
// file is never held in memory whole. Call discard() once it is uploaded.
export async function encryptBlob(
  key: CryptoKey,
  blob: Blob,
  signal?: AbortSignal,
  chunk = CHUNK,
): Promise<{ blob: Blob; cipher: Cipher; discard: () => Promise<void> }> {
  const nonce = random(8);
  const hasher = await createHasher();
  const sink = (await diskSink()) ?? memorySink();

  try {
    for (let i = 0; i < chunks(blob.size, chunk); i++) {
      signal?.throwIfAborted();

      const plain = await blob.slice(i * chunk, (i + 1) * chunk).arrayBuffer();
      const sealed = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv: chunkIv(nonce, i) }, key, plain),
      );

      hasher.update(sealed);
      await sink.write(sealed);
    }
  } catch (error) {
    await sink.abort();

    throw error;
  }

  const { blob: encrypted, discard } = await sink.finish();

  return {
    blob: encrypted,
    discard,
    cipher: { nonce: toBase64(nonce), chunk, size: encrypted.size, sha256: hasher.digest() },
  };
}

// Takes ciphertext in pieces of any size and hands back plain bytes chunk by chunk.
export class Decryptor {
  private buffer = new Uint8Array(0);
  private index = 0;
  private plain = 0;
  private readonly nonce: Uint8Array;

  constructor(
    private readonly key: CryptoKey,
    private readonly cipher: Cipher,
    private readonly size: number,
  ) {
    this.nonce = fromBase64(cipher.nonce);
  }

  private async open(sealed: Uint8Array) {
    try {
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: chunkIv(this.nonce, this.index++) as BufferSource },
          this.key,
          sealed as BufferSource,
        ),
      );

      this.plain += plain.byteLength;

      return plain;
    } catch {
      throw new Error("The file could not be decrypted: wrong key or damaged data.");
    }
  }

  async push(bytes: Uint8Array): Promise<Uint8Array[]> {
    const joined = new Uint8Array(this.buffer.byteLength + bytes.byteLength);

    joined.set(this.buffer);
    joined.set(bytes, this.buffer.byteLength);

    const out: Uint8Array[] = [];
    const sealed = this.cipher.chunk + TAG;

    let at = 0;

    while (joined.byteLength - at >= sealed) {
      out.push(await this.open(joined.subarray(at, at + sealed)));
      at += sealed;
    }

    this.buffer = joined.slice(at);

    return out;
  }

  // Decrypts what is left and checks nothing was cut off.
  async finish(): Promise<Uint8Array[]> {
    const out = this.buffer.byteLength > 0 || this.index === 0 ? [await this.open(this.buffer)] : [];

    if (this.plain !== this.size) {
      throw new Error("The file could not be decrypted: it is incomplete.");
    }

    return out;
  }
}

export async function decryptBlob(
  key: CryptoKey,
  cipher: Cipher,
  size: number,
  blob: Blob,
  type: string,
): Promise<Blob> {
  const decryptor = new Decryptor(key, cipher, size);
  const out: Uint8Array[] = [];

  for (let at = 0; at < blob.size; at += CHUNK) {
    out.push(...(await decryptor.push(new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer()))));
  }

  out.push(...(await decryptor.finish()));

  return new Blob(out as BlobPart[], { type });
}
