export type Location = {
  account: string;
  fileId: string;
};

export type Part = Location & {
  offset: number;
  bytes: number;
  sha256: string;
};

export type FileRecord = {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  sha256: string;

  location?: Location;
  parts?: Part[];
  copies?: Location[];

  // Stored encrypted: locations and parts hold ciphertext, described here.
  // sha256 above is always of the plain file, so duplicates are still found.
  encrypted?: boolean;
  cipher?: Cipher;
  folder: string;
  trashedAt?: string;
  // Drive permission that makes the main copy viewable by link.
  shareId?: string;
  // Nebula revokes the link at its first run after this time.
  shareExpires?: string;
  starred?: boolean;
  // Last change to this record; decides which copy wins when indexes merge.
  updatedAt?: string;
};

export type Cipher = {
  // Base64, 8 bytes; each chunk's IV is this followed by the chunk number.
  nonce: string;
  // Plain bytes per chunk; every chunk but the last is this long.
  chunk: number;
  size: number;
  sha256: string;
};

export type AccountRecord = {
  email: string;
  priority: number;
  buffer: number;
  lastUsed: string;
  updatedAt?: string;
};

// The file key, wrapped with a key derived from the passphrase. The passphrase
// and the unwrapped key never leave this browser's memory.
export type Encryption = {
  salt: string;
  iterations: number;
  iv: string;
  wrappedKey: string;
};

export type Routing = "priority" | "least-used";
export type Theme = "system" | "light" | "dark";

export type IndexFile = {
  version: 1;
  updatedAt: string;

  accounts: AccountRecord[];
  files: FileRecord[];
  folders: string[];

  settings: {
    routing: Routing;
    theme: Theme;
    safeMode: boolean;
    // Encrypt new uploads; needs `encryption` to be set up.
    encrypt: boolean;
    encryption?: Encryption;
  };
  settingsAt?: string;

  // When each folder was last created, and when each file ("file:<id>"),
  // folder ("folder:<path>") or account ("account:<email>") was deleted.
  // Absent in indexes written before merging existed.
  foldersAt?: Record<string, string>;
  deleted?: Record<string, string>;
};
