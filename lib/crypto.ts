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

// Encrypts chunk by chunk. The result is a Blob the browser may keep on disk.
export async function encryptBlob(
  key: CryptoKey,
  blob: Blob,
  signal?: AbortSignal,
  chunk = CHUNK,
): Promise<{ blob: Blob; cipher: Cipher }> {
  const nonce = random(8);
  const hasher = await createHasher();
  const parts: Uint8Array<ArrayBuffer>[] = [];

  for (let i = 0; i < chunks(blob.size, chunk); i++) {
    signal?.throwIfAborted();

    const plain = await blob.slice(i * chunk, (i + 1) * chunk).arrayBuffer();
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: chunkIv(nonce, i) }, key, plain),
    );

    hasher.update(sealed);
    parts.push(sealed);
  }

  const encrypted = new Blob(parts, { type: "application/octet-stream" });

  return {
    blob: encrypted,
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
