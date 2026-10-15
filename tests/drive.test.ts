import { describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "../lib/errors";
import { downloadFile, uploadFile } from "../lib/google/drive";

vi.mock("../lib/google/auth", () => ({
  tokenFor: () => "token",
  forget: () => {},
}));

// No real waiting between retries.
vi.mock("../lib/retry", async (original) => ({
  ...(await original<typeof import("../lib/retry")>()),
  sleep: async () => {},
  waitForOnline: async () => {},
}));

const MB = 1024 * 1024;
const SESSION = "https://www.googleapis.com/upload/drive/v3/files?upload_id=abc";

type Call = { url: string; method: string; range: string | null; bytes: number };

// A stand-in for Google: answers folder lookups and session starts, and hands
// every PUT on the upload session to the given handler.
function fakeGoogle(onPut: (call: Call, n: number) => Response | Error) {
  const calls: Call[] = [];
  let puts = 0;

  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const call: Call = {
      url,
      method: init.method ?? "GET",
      range: headers.get("Content-Range"),
      bytes: init.body instanceof Blob ? init.body.size : 0,
    };

    calls.push(call);

    if (call.method === "PUT") {
      const answer = onPut(call, ++puts);

      if (answer instanceof Error) throw answer;

      return answer;
    }

    if (url.includes("uploadType=resumable")) {
      return new Response(null, { status: 200, headers: { Location: SESSION } });
    }

    return Response.json({ files: [{ id: "folder" }] });
  });

  return calls;
}

const more = (lastByte: number) =>
  new Response(null, { status: 308, headers: { Range: `bytes=0-${lastByte}` } });

const done = () => Response.json({ id: "file-1" });

const googleError = (status: number, reason: string) =>
  Response.json({ error: { message: reason, errors: [{ reason }] } }, { status });

describe("uploadFile", () => {
  it("sends 8 MB chunks and reports progress", async () => {
    const blob = new Blob([new Uint8Array(20 * MB)]);
    const progress: number[] = [];

    const calls = fakeGoogle((call, n) =>
      n < 3 ? more(n * 8 * MB - 1) : done(),
    );

    expect(await uploadFile("a@gmail.com", "big.bin", blob, (n) => progress.push(n))).toBe("file-1");

    expect(calls.filter((c) => c.method === "PUT").map((c) => c.range)).toEqual([
      `bytes 0-${8 * MB - 1}/${20 * MB}`,
      `bytes ${8 * MB}-${16 * MB - 1}/${20 * MB}`,
      `bytes ${16 * MB}-${20 * MB - 1}/${20 * MB}`,
    ]);
    expect(progress).toEqual([8 * MB, 16 * MB, 20 * MB]);
  });

  it("asks Google for the confirmed offset after a dropped connection", async () => {
    const blob = new Blob([new Uint8Array(20 * MB)]);

    const calls = fakeGoogle((call, n) => {
      if (n === 1) return more(8 * MB - 1);
      if (n === 2) return new TypeError("Failed to fetch");
      // The status query: only 10 MB arrived before the drop.
      if (n === 3) return more(10 * MB - 1);
      if (n === 4) return more(18 * MB - 1);

      return done();
    });

    await uploadFile("a@gmail.com", "big.bin", blob);

    expect(calls.filter((c) => c.method === "PUT").map((c) => c.range)).toEqual([
      `bytes 0-${8 * MB - 1}/${20 * MB}`,
      `bytes ${8 * MB}-${16 * MB - 1}/${20 * MB}`,
      `bytes */${20 * MB}`,
      `bytes ${10 * MB}-${18 * MB - 1}/${20 * MB}`,
      `bytes ${18 * MB}-${20 * MB - 1}/${20 * MB}`,
    ]);
  });

  it("retries server trouble and resumes", async () => {
    const blob = new Blob([new Uint8Array(4 * MB)]);

    fakeGoogle((call, n) => {
      if (n === 1) return googleError(503, "backendError");
      if (n === 2) return new Response(null, { status: 308 });

      return done();
    });

    expect(await uploadFile("a@gmail.com", "small.bin", blob)).toBe("file-1");
  });

  it("uploads an empty file", async () => {
    const calls = fakeGoogle(() => done());

    await uploadFile("a@gmail.com", "empty.txt", new Blob([]));

    expect(calls.at(-1)?.range).toBe("bytes */0");
  });

  it("reports a full account without retrying", async () => {
    const calls = fakeGoogle(() => googleError(403, "storageQuotaExceeded"));

    await expect(
      uploadFile("a@gmail.com", "x.bin", new Blob(["x"])),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });
});

describe("resume and download", () => {
  it("resumes a stopped upload of the same file in the same session", async () => {
    const blob = new Blob([new Uint8Array(12 * MB)]);
    const controller = new AbortController();

    const first = fakeGoogle((call, n) => {
      if (n === 1) {
        controller.abort();

        return more(8 * MB - 1);
      }

      return done();
    });

    await expect(
      uploadFile("a@gmail.com", "big.bin", blob, undefined, controller.signal),
    ).rejects.toThrow();
    expect(first.filter((c) => c.url.includes("uploadType=resumable"))).toHaveLength(1);

    const second = fakeGoogle((call, n) => (n === 1 ? more(8 * MB - 1) : done()));

    expect(await uploadFile("a@gmail.com", "big.bin", blob)).toBe("file-1");
    // No new session: it asks how far the old one got, then sends the rest.
    expect(second.filter((c) => c.url.includes("uploadType=resumable"))).toHaveLength(0);
    expect(second.filter((c) => c.method === "PUT").map((c) => c.range)).toEqual([
      `bytes */${12 * MB}`,
      `bytes ${8 * MB}-${12 * MB - 1}/${12 * MB}`,
    ]);
  });

  it("reports download progress as bytes arrive", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Blob(["hello world"])));

    const seen: number[] = [];
    const blob = await downloadFile("a@gmail.com", "id", (n) => seen.push(n));

    expect(await blob.text()).toBe("hello world");
    expect(seen.at(-1)).toBe(11);
  });
});
