// Writes the security headers from security-headers.mjs into each host's config.
import { writeFileSync } from "node:fs";
import { headersFile, vercelJson } from "./security-headers.mjs";

writeFileSync(new URL("../vercel.json", import.meta.url), vercelJson());
writeFileSync(new URL("../public/_headers", import.meta.url), headersFile());

console.log("Wrote vercel.json and public/_headers.");
