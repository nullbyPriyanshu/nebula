const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const FILE_KINDS = [
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
] as const;

export type FileKind = (typeof FILE_KINDS)[number];

const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|odt|ods|odp|rtf)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz)$/i;

export function fileKind(type: string, name: string): FileKind {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/") || DOCUMENT_EXT.test(name)) return "document";
  if (ARCHIVE_EXT.test(name)) return "archive";

  return "other";
}
