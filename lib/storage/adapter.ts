import {
  deleteFile,
  downloadFile,
  openFile,
  renameFile,
  setTrashed,
  shareFile,
  thumbnailLink,
  unshareFile,
  uploadFile,
} from "../google/drive";
import { cloudIndexVersion, readCloudIndex, writeCloudIndex } from "../google/google-index";
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
    signal?: AbortSignal,
  ): Promise<string>;

  // onProgress receives the number of bytes received so far.
  download(
    fileId: string,
    onProgress?: (n: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob>;

  // The bytes as a stream, for writing to disk without holding the file in memory.
  open(fileId: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;

  rename(fileId: string, name: string): Promise<void>;

  // A short-lived thumbnail URL, or null when the provider has none.
  thumbnail(fileId: string): Promise<string | null>;

  setTrashed(fileId: string, trashed: boolean): Promise<void>;

  remove(fileId: string): Promise<void>;

  // Makes the file viewable by anyone with its link; resolves with the permission id.
  share(fileId: string): Promise<string>;

  unshare(fileId: string, permissionId: string): Promise<void>;

  readIndex(): Promise<IndexFile | null>;

  // Resolves with the stored copy's new version, when the provider has one.
  writeIndex(index: IndexFile): Promise<string | null | void>;

  // A cheap check: changes whenever the stored copy does. Null when unknown.
  indexVersion(): Promise<string | null>;
}

export function createGoogleAdapter(email: string): DriveAdapter {
  return {
    id: `google:${email}`,
    email,
    getQuota: () => getGoogleQuota(email),
    upload: (name, blob, onProgress, signal) =>
      uploadFile(email, name, blob, onProgress, signal),
    download: (fileId, onProgress, signal) =>
      downloadFile(email, fileId, onProgress, signal),
    open: (fileId, signal) => openFile(email, fileId, signal),
    rename: (fileId, name) => renameFile(email, fileId, name),
    thumbnail: (fileId) => thumbnailLink(email, fileId),
    setTrashed: (fileId, trashed) => setTrashed(email, fileId, trashed),
    remove: (fileId) => deleteFile(email, fileId),
    share: (fileId) => shareFile(email, fileId),
    unshare: (fileId, permissionId) => unshareFile(email, fileId, permissionId),
    readIndex: () => readCloudIndex(email),
    writeIndex: (index) => writeCloudIndex(email, index),
    indexVersion: () => cloudIndexVersion(email),
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
