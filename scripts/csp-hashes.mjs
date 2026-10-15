// After `next build`: adds a per-page Content-Security-Policy that allows only
// the inline scripts actually on that page, by hash. With hashes present,
// browsers ignore the 'unsafe-inline' fallback in the server header.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIPT_SRC } from "./security-headers.mjs";

const OUT = new URL("../out/", import.meta.url).pathname;
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) yield* htmlFiles(path);
    else if (name.endsWith(".html")) yield path;
  }
}

let pages = 0;

for (const path of htmlFiles(OUT)) {
  const html = readFileSync(path, "utf8");
  const hashes = new Set();

  for (const [, body] of html.matchAll(INLINE)) {
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }

  const meta = `<meta http-equiv="Content-Security-Policy" content="script-src ${[...SCRIPT_SRC, ...hashes].join(" ")}">`;

  // First thing in <head>, before any script it governs.
  writeFileSync(path, html.replace(/<head>/, `<head>${meta}`));
  pages++;
}

console.log(`Added script hashes to ${pages} pages.`);
