// Small image previews for the grid. They live only on this device: in
// IndexedDB on a private device, in memory on a public one. Never in the index.

const DB_NAME = "nebula-thumbs";
const STORE_NAME = "thumbs";
const SIZE = 256;
// Decoding a huge image just for a thumbnail is not worth it.
const MAX_SOURCE = 40 * 1024 * 1024;

const memory = new Map<string, Blob>();
const listeners = new Set<(id: string) => void>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open thumbnails"));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const canDraw = () =>
  typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function";

// A frame about a second into the video, or null when the browser cannot play it.
function videoFrame(blob: Blob): Promise<ImageBitmap | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const done = (frame: ImageBitmap | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(frame);
    };

    video.muted = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      createImageBitmap(video).then(done, () => done(null));
    };
    video.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    video.src = url;
  });
}

// Resolves with a small WebP of the image or video, or null when it cannot be drawn.
export async function makeThumb(blob: Blob): Promise<Blob | null> {
  const video = blob.type.startsWith("video/");

  if ((!blob.type.startsWith("image/") && !video) || !canDraw()) {
    return null;
  }

  // Videos only need their start, so size does not matter for them.
  if (!video && blob.size > MAX_SOURCE) {
    return null;
  }

  try {
    const bitmap = video ? await videoFrame(blob) : await createImageBitmap(blob);

    if (!bitmap) return null;

    const scale = Math.min(1, SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );

    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
  } catch {
    return null;
  }
}

export async function saveThumb(id: string, thumb: Blob, persist: boolean) {
  memory.set(id, thumb);
  listeners.forEach((listener) => listener(id));

  if (persist) {
    await run("readwrite", (store) => store.put(thumb, id)).catch(() => {});
  }
}

export async function getThumb(id: string): Promise<Blob | null> {
  const cached = memory.get(id);

  if (cached || typeof indexedDB === "undefined") {
    return cached ?? null;
  }

  const stored = await run("readonly", (store) => store.get(id)).catch(() => null);

  if (stored instanceof Blob) {
    memory.set(id, stored);

    return stored;
  }

  return null;
}

export async function deleteThumb(id: string) {
  memory.delete(id);

  if (typeof indexedDB !== "undefined") {
    await run("readwrite", (store) => store.delete(id)).catch(() => {});
  }
}

export async function clearThumbs() {
  memory.clear();

  if (typeof indexedDB !== "undefined") {
    await run("readwrite", (store) => store.clear()).catch(() => {});
  }
}

// Tells a mounted grid tile that its thumbnail just appeared.
export function onThumb(listener: (id: string) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
