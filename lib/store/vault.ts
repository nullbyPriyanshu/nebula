// The encryption key: unlocked with the passphrase once per session, kept in memory only.
import { createVault, unlockVault, WrongPassphraseError, wrapKey } from "../crypto";
import { askText, commit, notify, set, state } from "./core";

let key: CryptoKey | null = null;
let asking: Promise<CryptoKey> | null = null;

export class LockedError extends Error {
  constructor() {
    super("Encrypted files need the passphrase, and none was given.");
    this.name = "LockedError";
  }
}

// Turns encryption on with a new passphrase. Earlier files stay as they are.
export async function setUpEncryption(passphrase: string) {
  const vault = await createVault(passphrase);

  key = vault.key;
  set({ unlocked: true });
  await commit({
    ...state.index,
    settings: { ...state.index.settings, encrypt: true, encryption: vault.encryption },
  });
  notify("success", "Encryption is on. New uploads are encrypted in this browser.");
}

export async function unlock(passphrase: string): Promise<boolean> {
  const encryption = state.index.settings.encryption;

  if (!encryption) return false;

  try {
    key = await unlockVault(encryption, passphrase);
    set({ unlocked: true });

    return true;
  } catch (error) {
    if (error instanceof WrongPassphraseError) return false;

    throw error;
  }
}

export function lock() {
  key = null;
  set({ unlocked: false });
}

// The key, asking for the passphrase if this session has not had it yet.
// Parallel callers share one question.
export function requireKey(): Promise<CryptoKey> {
  if (key) return Promise.resolve(key);

  asking ??= (async () => {
    try {
      for (let wrong = false; ; wrong = true) {
        const passphrase = await askText({
          title: "Enter your encryption passphrase",
          body: wrong
            ? "That passphrase is not right. Try again."
            : "Your encrypted files can only be read with it. Nebula keeps it in memory until you close the tab.",
          label: "Passphrase",
          secret: true,
          confirm: "Unlock",
        });

        if (!passphrase) throw new LockedError();
        if (await unlock(passphrase)) return key!;
      }
    } finally {
      asking = null;
    }
  })();

  return asking;
}

export async function changePassphrase(passphrase: string) {
  const current = await requireKey();
  const encryption = await wrapKey(current, passphrase);

  await commit({ ...state.index, settings: { ...state.index.settings, encryption } });
  notify("success", "Passphrase changed. Your files did not need re-encrypting.");
}

export async function setEncrypt(encrypt: boolean) {
  await commit({ ...state.index, settings: { ...state.index.settings, encrypt } });
}
