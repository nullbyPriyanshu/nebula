// The one definition of Nebula's security headers. `pnpm headers` writes them
// into vercel.json (Vercel) and public/_headers (Netlify, Cloudflare Pages);
// tests/headers.test.ts fails if either file drifts from this.

export const SCRIPT_SRC = [
  "'self'",
  "'wasm-unsafe-eval'",
  "https://accounts.google.com/gsi/client",
];

export const CSP = {
  "default-src": ["'self'"],
  // 'unsafe-inline' is only a fallback for hosts that ignore the per-page
  // policy: the build adds one to every page listing the hash of each inline
  // script, and browsers then ignore 'unsafe-inline'.
  "script-src": [...SCRIPT_SRC, "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"],
  // blob: lets PDFs and videos be previewed from memory.
  "frame-src": ["https://accounts.google.com", "blob:"],
  "media-src": ["'self'", "blob:"],
  "connect-src": ["'self'", "https://accounts.google.com", "https://www.googleapis.com"],
  // googleusercontent.com serves Google Drive's own thumbnails.
  "img-src": ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
};

export const policy = (directives = CSP) =>
  Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

export const HEADERS = {
  "Content-Security-Policy": policy(),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export const vercelJson = () =>
  JSON.stringify(
    {
      headers: [
        {
          source: "/(.*)",
          headers: Object.entries(HEADERS).map(([key, value]) => ({ key, value })),
        },
      ],
    },
    null,
    2,
  ) + "\n";

export const headersFile = () =>
  "/*\n" + Object.entries(HEADERS).map(([key, value]) => `  ${key}: ${value}`).join("\n") + "\n";
