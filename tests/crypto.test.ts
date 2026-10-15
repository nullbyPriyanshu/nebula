import { describe, expect, it } from "vitest";
import {
  Decryptor,
  WrongPassphraseError,
  cipherSize,
  createVault,
  decryptBlob,
  encryptBlob,
  unlockVault,
  wrapKey,
} from "../lib/crypto";
import { sha256 } from "../lib/hash";

const bytes = (n: number) => new Blob([Uint8Array.from({ length: n }, (_, i) => i % 251)]);

describe("encryption", () => {
  it("round-trips across chunk boundaries, including empty and exact-multiple sizes", async () => {
    const { key } = await createVault("pass");

    for (const size of [0, 1, 15, 16, 17, 48, 50]) {
      const plain = bytes(size);
      const { blob, cipher } = await encryptBlob(key, plain, undefined, 16);

      expect(blob.size).toBe(cipherSize(size, 16));
      expect(await sha256(blob)).toBe(cipher.sha256);

      const back = await decryptBlob(key, cipher, size, blob, "");

      expect(await sha256(back)).toBe(await sha256(plain));
    }
  });

  it("decrypts ciphertext arriving in odd-sized pieces", async () => {
    const { key } = await createVault("pass");
    const plain = bytes(100);
    const { blob, cipher } = await encryptBlob(key, plain, undefined, 16);
    const sealed = new Uint8Array(await blob.arrayBuffer());
    const decryptor = new Decryptor(key, cipher, 100);
    const out: Uint8Array[] = [];

    for (let at = 0; at < sealed.length; at += 7) {
      out.push(...(await decryptor.push(sealed.subarray(at, at + 7))));
    }

    out.push(...(await decryptor.finish()));
    expect(await sha256(new Blob(out as BlobPart[]))).toBe(await sha256(plain));
  });

  it("refuses tampered or truncated ciphertext", async () => {
    const { key } = await createVault("pass");
    const { blob, cipher } = await encryptBlob(key, bytes(40), undefined, 16);
    const sealed = new Uint8Array(await blob.arrayBuffer());

    sealed[3] ^= 1;
    await expect(decryptBlob(key, cipher, 40, new Blob([sealed]), "")).rejects.toThrow(/decrypted/);

    const cut = (await blob.arrayBuffer()).slice(0, 32);

    await expect(decryptBlob(key, cipher, 40, new Blob([cut]), "")).rejects.toThrow(/incomplete|decrypted/);
  });

  it("unlocks with the right passphrase only, and survives a passphrase change", async () => {
    const { key, encryption } = await createVault("right");

    await expect(unlockVault(encryption, "wrong")).rejects.toBeInstanceOf(WrongPassphraseError);

    const { blob, cipher } = await encryptBlob(key, bytes(20), undefined, 16);
    const rewrapped = await wrapKey(await unlockVault(encryption, "right"), "new");
    const again = await unlockVault(rewrapped, "new");

    expect((await decryptBlob(again, cipher, 20, blob, "")).size).toBe(20);
  });
});
