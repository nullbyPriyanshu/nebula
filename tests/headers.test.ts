import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headersFile, vercelJson } from "../scripts/security-headers.mjs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("security headers", () => {
  it("are the same in every host's config (run `pnpm headers` after changing them)", () => {
    expect(read("vercel.json")).toBe(vercelJson());
    expect(read("public/_headers")).toBe(headersFile());
  });
});
