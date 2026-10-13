import { deleteFile, downloadFile, setTrashed, uploadFile } from "../google/drive";
import { readCloudIndex, writeCloudIndex } from "../google/google-index";
import type { IndexFile } from "../index-types";
import { getGoogleQuota } from "./google-quota";

// Every storage account looks like this to the rest of the app.
// Another provider only needs one more factory below.
export interface DriveAdapter {
  id: string;
  email: string;

  getQuota(): Promise<{
    total: number;
    used: number;
  }>;

  // onProgress receives the number of bytes sent so far.
  upload(
    name: string,
    blob: Blob,
    onProgress?: (n: number) => void,
  ): Promise<string>;

  download(fileId: string): Promise<Blob>;

  setTrashed(fileId: string, trashed: boolean): Promise<void>;

  remove(fileId: string): Promise<void>;

  readIndex(): Promise<IndexFile | null>;

  writeIndex(index: IndexFile): Promise<void>;
}

export function createGoogleAdapter(email: string): DriveAdapter {
  return {
    id: `google:${email}`,
    email,
    getQuota: () => getGoogleQuota(email),
    upload: (name, blob, onProgress) => uploadFile(email, name, blob, onProgress),
    download: (fileId) => downloadFile(email, fileId),
    setTrashed: (fileId, trashed) => setTrashed(email, fileId, trashed),
    remove: (fileId) => deleteFile(email, fileId),
    readIndex: () => readCloudIndex(email),
    writeIndex: (index) => writeCloudIndex(email, index),
  };
}

const adapters = new Map<string, DriveAdapter>();

export function adapterFor(email: string): DriveAdapter {
  let adapter = adapters.get(email);

  if (!adapter) {
    adapter = createGoogleAdapter(email);
    adapters.set(email, adapter);
  }

  return adapter;
}
