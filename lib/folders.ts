export const ROOT = "/";

export function normalizePath(path: string): string {
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return ROOT + segments.join("/");
}

export const joinPath = (parent: string, name: string) =>
  normalizePath(`${parent}/${name.replaceAll("/", " ")}`);

export function parentOf(path: string): string {
  return normalizePath(path.slice(0, path.lastIndexOf("/")));
}

export const folderName = (path: string) =>
  path.slice(path.lastIndexOf("/") + 1);

// "/Sem 4/DBMS" -> ["/", "/Sem 4", "/Sem 4/DBMS"]
export function crumbs(path: string): string[] {
  const segments = normalizePath(path).split("/").filter(Boolean);

  return [
    ROOT,
    ...segments.map((_, i) => ROOT + segments.slice(0, i + 1).join("/")),
  ];
}

export const isInside = (path: string, folder: string) =>
  path === folder || path.startsWith(folder === ROOT ? ROOT : `${folder}/`);

// Every folder that should exist, including ancestors of the given paths.
export function allFolders(paths: string[]): string[] {
  const all = new Set<string>();

  for (const path of paths) {
    for (const crumb of crumbs(path)) {
      if (crumb !== ROOT) all.add(crumb);
    }
  }

  return [...all].sort((a, b) => a.localeCompare(b));
}

export const childFolders = (folders: string[], path: string) =>
  folders.filter((folder) => folder !== ROOT && parentOf(folder) === path);
