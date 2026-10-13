import type { IndexFile } from "./index-types";

const DB_NAME = "nebula-db";
const DB_VERSION = 1;
const STORE_NAME = "metadata";
const INDEX_KEY = "main-index";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
  });
}

export async function saveLocalIndex(
  index: IndexFile
): Promise<void> {
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      store.put(index, INDEX_KEY);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Failed to save index"));
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Index transaction aborted"));
      };
    });
  } finally {
    db.close();
  }
}

export async function loadLocalIndex(): Promise<IndexFile | null> {
  const db = await openDatabase();

  try {
    return await new Promise<IndexFile | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(INDEX_KEY);

      request.onsuccess = () => {
        resolve((request.result as IndexFile | undefined) ?? null);
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Failed to load index"));
      };
    });
  } finally {
    db.close();
  }
}

export async function clearLocalIndex(): Promise<void> {
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).delete(INDEX_KEY);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Failed to clear index"));
      };
    });
  } finally {
    db.close();
  }
}
