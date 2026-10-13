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

  encrypted?: boolean;
  folder: string;
  trashedAt?: string;
};

export type AccountRecord = {
  email: string;
  priority: number;
  buffer: number;
  lastUsed: string;
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
  };
};
