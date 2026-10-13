// The small part of Google Identity Services that Nebula uses.
// https://developers.google.com/identity/oauth2/web/reference/js-reference

type GisTokenResponse = {
  access_token: string;
  expires_in: string;
  scope: string;
  error?: string;
};

type GisTokenClient = {
  requestAccessToken(overrides?: {
    prompt?: string;
    login_hint?: string;
  }): void;
};

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: GisTokenResponse) => void;
          error_callback?: (error: { type?: string }) => void;
        }): GisTokenClient;
        hasGrantedAllScopes(
          response: GisTokenResponse,
          ...scopes: string[]
        ): boolean;
        revoke(token: string, done?: () => void): void;
      };
    };
  };
}
