import { AuthExpiredError } from "../errors";

export { AuthExpiredError };

export type Account = {
  email: string;
  token: string;
  expiresAt: number;
};

// Tokens live only here, in memory. Never write them to storage.
const accounts = new Map<string, Account>();

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
].join(" ");

function requestToken(opts: {
  prompt: string;
  login_hint?: string;
}): Promise<Account> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts.oauth2;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!oauth2) {
      return reject(
        new Error("Google sign-in has not loaded. Check your connection and reload."),
      );
    }

    if (!clientId) {
      return reject(
        new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set in .env.local."),
      );
    }

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,

      callback: async (r) => {
        try {
          if (r.error) {
            return reject(new Error(r.error));
          }

          if (!oauth2.hasGrantedAllScopes(r, ...SCOPES.split(" "))) {
            oauth2.revoke(r.access_token);

            return reject(
              new Error("Tick every permission box so Nebula can store files."),
            );
          }

          const response = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
            {
              headers: {
                Authorization: `Bearer ${r.access_token}`,
              },
            },
          );

          if (!response.ok) {
            // Say why: usually the Drive API is not enabled for the project.
            const body = await response.json().catch(() => null);
            const reason = body?.error?.message ?? `HTTP ${response.status}`;

            throw new Error(`Google refused the account lookup: ${reason}`);
          }

          const me = await response.json();

          const acc: Account = {
            email: me.user.emailAddress,
            token: r.access_token,
            expiresAt: Date.now() + (Number(r.expires_in) - 60) * 1000,
          };

          if (opts.login_hint && opts.login_hint !== acc.email) {
            oauth2.revoke(acc.token);

            return reject(
              new Error(
                `You signed in as ${acc.email}. Choose ${opts.login_hint} to reconnect it.`,
              ),
            );
          }

          accounts.set(acc.email, acc);

          resolve(acc);
        } catch (error) {
          reject(error);
        }
      },

      error_callback: (e) => {
        reject(new Error(e.type ?? "popup_failed_to_open"));
      },
    });

    client.requestAccessToken(opts);
  });
}

// Connect a new Google account. Call directly from a click handler.
export const addAccount = () =>
  requestToken({
    prompt: "select_account consent",
  });

// Reconnect an existing Google account. Call directly from a click handler.
export const reconnect = (email: string) =>
  requestToken({
    prompt: "",
    login_hint: email,
  });

// Get a valid access token for a connected account.
export function tokenFor(email: string): string {
  const account = accounts.get(email);

  if (!account || Date.now() > account.expiresAt) {
    accounts.delete(email);

    throw new AuthExpiredError(email);
  }

  return account.token;
}

// Forget the token without revoking Nebula's access to the account.
export function forget(email: string): void {
  accounts.delete(email);
}

// Sign out and request token revocation.
export function signOut(email: string): void {
  const account = accounts.get(email);

  if (account) {
    window.google?.accounts.oauth2.revoke(account.token, () => {});
  }

  accounts.delete(email);
}

export function signOutAll(): void {
  for (const email of [...accounts.keys()]) {
    signOut(email);
  }
}
