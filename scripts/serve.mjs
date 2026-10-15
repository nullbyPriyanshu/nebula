// Serves the static export in out/ with the same security headers as
// production. Used by `pnpm start` and the browser tests.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { HEADERS } from "./security-headers.mjs";

const ROOT = new URL("../out/", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

// "/accounts/" -> out/accounts/index.html; unknown paths get the 404 page.
function resolve(pathname) {
  const path = normalize(join(ROOT, decodeURIComponent(pathname)));

  if (!path.startsWith(ROOT)) return null;
  if (existsSync(path) && statSync(path).isFile()) return path;
  if (existsSync(join(path, "index.html"))) return join(path, "index.html");

  return null;
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const file = resolve(url.pathname);
  const target = file ?? join(ROOT, "404.html");

  response.writeHead(file ? 200 : 404, {
    ...HEADERS,
    "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(target).pipe(response);
}).listen(PORT, () => console.log(`Nebula on http://localhost:${PORT}`));
