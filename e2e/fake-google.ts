import type { BrowserContext, Route } from "@playwright/test";

// Google sign-in and Drive, faked at the network level so the real app code
// runs unchanged. Each account is a small in-memory Drive.

type DriveFile = {
  name: string;
  parents: string[];
  mimeType: string;
  content: Buffer;
  trashed: boolean;
};

type Account = {
  files: Map<string, DriveFile>;
  limit: number;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "Location, Range, Content-Length",
};

// Signs in as `window.__nextLogin`, or the hinted account when reconnecting.
const GIS_STUB = `
window.google = { accounts: { oauth2: {
  initTokenClient(config) {
    return {
      requestAccessToken(options) {
        const email = (options && options.login_hint) || window.__nextLogin || "student@gmail.com";
        setTimeout(() => config.callback({ access_token: "token:" + email, expires_in: 3600 }), 10);
      },
    };
  },
  hasGrantedAllScopes() { return true; },
  revoke(token, done) { if (done) done(); },
} } };
`;

export class FakeGoogle {
  accounts = new Map<string, Account>();
  private ids = 0;
  private sessions = new Map<string, { email: string; name: string; parents: string[]; mimeType: string; chunks: Buffer[] }>();

  account(email: string, limit = 10 * 1024 ** 3) {
    let account = this.accounts.get(email);

    if (!account) {
      account = { files: new Map(), limit };
      this.accounts.set(email, account);
    }

    return account;
  }

  // Names of the files stored in an account, besides Nebula's own folder and index.
  storedNames(email: string) {
    return [...this.account(email).files.values()]
      .filter((file) => file.mimeType !== "application/vnd.google-apps.folder" && !file.parents.includes("appDataFolder"))
      .map((file) => file.name);
  }

  storedContent(email: string) {
    return [...this.account(email).files.values()]
      .filter((file) => file.mimeType !== "application/vnd.google-apps.folder" && !file.parents.includes("appDataFolder"))
      .map((file) => file.content);
  }

  async install(context: BrowserContext) {
    await context.route("https://accounts.google.com/gsi/client", (route) =>
      route.fulfill({ contentType: "text/javascript", body: GIS_STUB }),
    );
    await context.route("https://www.googleapis.com/**", (route) => this.handle(route));
  }

  private json(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
    return route.fulfill({
      status,
      headers: { ...CORS, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  private async handle(route: Route) {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }

    // Upload sessions carry no Authorization header, like Google's.
    const session = /^\/upload\/session\/(\w+)$/.exec(url.pathname);

    if (session && method === "PUT") {
      return this.put(route, session[1]);
    }

    const auth = (await request.headerValue("authorization")) ?? "";
    const email = /^Bearer token:(.+)$/.exec(auth)?.[1];

    if (!email) {
      return this.json(route, { error: { message: "Login Required" } }, 401);
    }

    const account = this.account(email);
    const path = url.pathname;
    const fields = url.searchParams.get("fields") ?? "";

    if (path === "/drive/v3/about") {
      if (fields.includes("user")) return this.json(route, { user: { emailAddress: email } });

      const usage = [...account.files.values()].reduce((sum, file) => sum + file.content.length, 0);

      return this.json(route, { storageQuota: { limit: String(account.limit), usage: String(usage) } });
    }

    if (path === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const name = /name = '([^']+)'/.exec(q)?.[1];
      const inAppData = url.searchParams.get("spaces") === "appDataFolder";
      const found = [...account.files.entries()].filter(
        ([, file]) =>
          file.name === name && !file.trashed && file.parents.includes("appDataFolder") === inAppData,
      );

      return this.json(route, { files: found.map(([id]) => ({ id })) });
    }

    if (path === "/drive/v3/files" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}");
      const id = `f${++this.ids}`;

      account.files.set(id, {
        name: body.name,
        parents: body.parents ?? [],
        mimeType: body.mimeType ?? "application/octet-stream",
        content: Buffer.alloc(0),
        trashed: false,
      });

      return this.json(route, { id });
    }

    if (path === "/upload/drive/v3/files" && method === "POST") {
      const body = JSON.parse(request.postData() ?? "{}");
      const id = String(++this.ids);

      this.sessions.set(id, { email, name: body.name, parents: body.parents ?? [], mimeType: body.mimeType, chunks: [] });

      return route.fulfill({
        status: 200,
        headers: { ...CORS, Location: `https://www.googleapis.com/upload/session/${id}` },
      });
    }

    const media = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path);

    if (media && method === "PATCH") {
      const file = account.files.get(decodeURIComponent(media[1]));

      if (!file) return this.json(route, { error: { message: "Not found" } }, 404);

      file.content = request.postDataBuffer() ?? Buffer.alloc(0);

      return this.json(route, {});
    }

    const permission = /^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/.exec(path);

    if (permission) {
      return method === "POST" ? this.json(route, { id: `perm-${++this.ids}` }) : route.fulfill({ status: 204, headers: CORS });
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(path);
    const file = one ? account.files.get(decodeURIComponent(one[1])) : undefined;

    if (!one || !file) {
      return this.json(route, { error: { message: "Not found", errors: [{ reason: "notFound" }] } }, 404);
    }

    if (method === "GET" && url.searchParams.get("alt") === "media") {
      return route.fulfill({ status: 200, headers: { ...CORS, "Content-Type": file.mimeType }, body: file.content });
    }

    if (method === "GET") {
      return this.json(route, {});
    }

    if (method === "PATCH") {
      Object.assign(file, JSON.parse(request.postData() ?? "{}"));

      return this.json(route, {});
    }

    if (method === "DELETE") {
      account.files.delete(decodeURIComponent(one[1]));

      return route.fulfill({ status: 204, headers: CORS });
    }

    return this.json(route, { error: { message: "Unsupported" } }, 400);
  }

  private put(route: Route, id: string) {
    const session = this.sessions.get(id);

    if (!session) {
      return route.fulfill({ status: 404, headers: CORS });
    }

    const request = route.request();
    const range = request.headers()["content-range"] ?? "";
    const total = Number(/\/(\d+)$/.exec(range)?.[1] ?? 0);
    const body = request.postDataBuffer();

    if (body) session.chunks.push(body);

    const received = session.chunks.reduce((sum, chunk) => sum + chunk.length, 0);

    if (received < total) {
      return route.fulfill({ status: 308, headers: { ...CORS, Range: `bytes=0-${received - 1}` } });
    }

    const fileId = `f${++this.ids}`;

    this.account(session.email).files.set(fileId, {
      name: session.name,
      parents: session.parents,
      mimeType: session.mimeType,
      content: Buffer.concat(session.chunks),
      trashed: false,
    });
    this.sessions.delete(id);

    return this.json(route, { id: fileId });
  }
}
